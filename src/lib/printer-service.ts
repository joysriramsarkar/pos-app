/**
 * Printer Service
 * Unified thermal printer service supporting Browser Print, ESC/POS commands,
 * and Web Bluetooth / Network thermal printers (58mm / 80mm).
 */

export interface PrinterDevice {
  id: string;
  name: string;
  type: 'bluetooth' | 'network' | 'usb' | 'system';
}

export interface PrintReceiptPayload {
  businessName: string;
  businessAddress?: string | null;
  businessPhone?: string | null;
  invoiceNumber: string;
  cashierName?: string | null;
  date: string | Date;
  items: Array<{
    name: string;
    quantity: number;
    price: number;
    total: number;
  }>;
  subtotal: number;
  discount?: number;
  tax?: number;
  total: number;
  paid: number;
  change?: number;
  paymentMethod: string;
  notes?: string | null;
}

class PrinterService {
  /**
   * Browser-based printing with silent print CSS
   */
  public printBrowser(): void {
    if (typeof window !== 'undefined') {
      window.print();
    }
  }

  /**
   * Format ESC/POS binary buffer for thermal printers (58mm / 80mm)
   */
  public generateEscPosBuffer(payload: PrintReceiptPayload, paperWidth: '58mm' | '80mm' = '58mm'): Uint8Array {
    const encoder = new TextEncoder();
    const bytes: number[] = [];

    // ESC/POS Command Constants
    const ESC = 0x1b;
    const GS = 0x1d;

    // Initialize printer: ESC @
    bytes.push(ESC, 0x40);

    // Center alignment: ESC a 1
    bytes.push(ESC, 0x61, 0x01);

    // Double height/width header: ESC ! 0x30
    bytes.push(ESC, 0x21, 0x30);
    bytes.push(...encoder.encode(payload.businessName + '\n'));

    // Normal text: ESC ! 0
    bytes.push(ESC, 0x21, 0x00);
    if (payload.businessAddress) {
      bytes.push(...encoder.encode(payload.businessAddress + '\n'));
    }
    if (payload.businessPhone) {
      bytes.push(...encoder.encode('Phone: ' + payload.businessPhone + '\n'));
    }

    const divider = paperWidth === '80mm' ? '------------------------------------------------\n' : '--------------------------------\n';
    bytes.push(...encoder.encode(divider));

    // Left align: ESC a 0
    bytes.push(ESC, 0x61, 0x00);
    bytes.push(...encoder.encode(`Invoice: ${payload.invoiceNumber}\n`));
    bytes.push(...encoder.encode(`Date: ${new Date(payload.date).toLocaleString()}\n`));
    if (payload.cashierName) {
      bytes.push(...encoder.encode(`Cashier: ${payload.cashierName}\n`));
    }
    bytes.push(...encoder.encode(divider));

    // Line items
    for (const item of payload.items) {
      const line = `${item.name}\n  ${item.quantity} x ${item.price.toFixed(2)} = ${item.total.toFixed(2)}\n`;
      bytes.push(...encoder.encode(line));
    }

    bytes.push(...encoder.encode(divider));

    // Right align for totals: ESC a 2
    bytes.push(ESC, 0x61, 0x02);
    bytes.push(...encoder.encode(`Subtotal: ${payload.subtotal.toFixed(2)}\n`));
    if (payload.discount && payload.discount > 0) {
      bytes.push(...encoder.encode(`Discount: -${payload.discount.toFixed(2)}\n`));
    }
    if (payload.tax && payload.tax > 0) {
      bytes.push(...encoder.encode(`Tax: +${payload.tax.toFixed(2)}\n`));
    }

    // Bold total: ESC E 1
    bytes.push(ESC, 0x45, 0x01);
    bytes.push(...encoder.encode(`TOTAL: ${payload.total.toFixed(2)}\n`));
    bytes.push(ESC, 0x45, 0x00);

    bytes.push(...encoder.encode(`Paid (${payload.paymentMethod}): ${payload.paid.toFixed(2)}\n`));
    if (payload.change && payload.change > 0) {
      bytes.push(...encoder.encode(`Change: ${payload.change.toFixed(2)}\n`));
    }

    // Center alignment for footer: ESC a 1
    bytes.push(ESC, 0x61, 0x01);
    bytes.push(...encoder.encode(divider));
    bytes.push(...encoder.encode('Thank You! Visit Again.\n\n\n\n'));

    // Cut paper command: GS V 66 0
    bytes.push(GS, 0x56, 0x42, 0x00);

    return new Uint8Array(bytes);
  }

  /**
   * Print to Web Bluetooth thermal printer
   */
  public async printBluetooth(payload: PrintReceiptPayload): Promise<boolean> {
    if (typeof navigator === 'undefined' || !(navigator as any).bluetooth) {
      this.printBrowser();
      return true;
    }

    try {
      const device = await (navigator as any).bluetooth.requestDevice({
        filters: [{ services: ['000018f0-0000-1000-8000-00805f9b34fb'] }],
        optionalServices: ['e7810a71-73ae-499d-8c15-faa9aef0c3f2'],
      });

      const server = await device.gatt.connect();
      const service = await server.getPrimaryService('000018f0-0000-1000-8000-00805f9b34fb');
      const characteristic = await service.getCharacteristic('00002af1-0000-1000-8000-00805f9b34fb');

      const buffer = this.generateEscPosBuffer(payload);
      // Chunk buffer into 512 byte packets for Bluetooth MTU
      const chunkSize = 512;
      for (let i = 0; i < buffer.length; i += chunkSize) {
        const chunk = buffer.slice(i, i + chunkSize);
        await characteristic.writeValue(chunk);
      }

      return true;
    } catch (err) {
      console.warn('Bluetooth print failed or cancelled, falling back to browser print:', err);
      this.printBrowser();
      return false;
    }
  }

  /**
   * Connects to a Web Bluetooth printer device
   */
  public static async connectBluetooth(): Promise<any> {
    if (typeof navigator === 'undefined' || !(navigator as any).bluetooth) {
      throw new Error('Web Bluetooth is not supported on this browser/platform');
    }
    const device = await (navigator as any).bluetooth.requestDevice({
      acceptAllDevices: true,
      optionalServices: [
        '000018f0-0000-1000-8000-00805f9b34fb',
        'e7810a71-73ae-499d-8c15-faa9aef0c3f2',
      ],
    });
    return device;
  }

  /**
   * Static helper to print receipt
   */
  public static async printReceipt(
    sale: any,
    business: { name: string; address?: string | null; phone?: string | null; currency?: string },
    paperWidth: '58mm' | '80mm' = '58mm'
  ): Promise<boolean> {
    const payload: PrintReceiptPayload = {
      businessName: business.name,
      businessAddress: business.address,
      businessPhone: business.phone,
      invoiceNumber: sale.invoiceNumber || 'INV-001',
      cashierName: sale.cashierName,
      date: sale.createdAt || new Date(),
      items: (sale.items || []).map((item: any) => ({
        name: item.productName || item.name,
        quantity: Number(item.quantity || 1),
        price: Number(item.unitPrice || item.price || 0),
        total: Number(item.totalPrice || item.total || 0),
      })),
      subtotal: Number(sale.subtotal || sale.totalAmount || 0),
      discount: Number(sale.discount || 0),
      tax: Number(sale.tax || 0),
      total: Number(sale.totalAmount || 0),
      paid: Number(sale.amountPaid || sale.paid || 0),
      change: Number(sale.change || 0),
      paymentMethod: sale.paymentMethod || 'CASH',
      notes: sale.notes,
    };
    return printerService.printBluetooth(payload);
  }
}

export { PrinterService };
export const printerService = new PrinterService();
