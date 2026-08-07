import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Filter, Search, SlidersHorizontal } from 'lucide-react';

interface TransactionFiltersProps {
  searchQuery: string;
  setSearchQuery: (query: string) => void;
  filterStatus: string;
  setFilterStatus: (status: string) => void;
  filterPaymentMethod: string;
  setFilterPaymentMethod: (method: string) => void;
  onReset: () => void;
}

export function TransactionFilters({
  searchQuery,
  setSearchQuery,
  filterStatus,
  setFilterStatus,
  filterPaymentMethod,
  setFilterPaymentMethod,
  onReset,
}: TransactionFiltersProps) {
  const [filterOpen, setFilterOpen] = useState(false);
  const t = useTranslations('TransactionHistory');
  const tc = useTranslations('Common');
  
  const activeFilterCount = [
    filterStatus !== 'all',
    filterPaymentMethod !== 'all'
  ].filter(Boolean).length;

  return (
    <div className="flex flex-col gap-2 shrink-0">
      {/* Mobile Search and Toggle */}
      <div className="md:hidden flex gap-2">
        <div className="relative flex-1 min-w-0">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
          <Input
            type="search"
            enterKeyHint="search"
            placeholder={t('search_placeholder')}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9 h-11 text-base bg-background shadow-sm touch-manipulation"
          />
        </div>
        <Button
          variant="outline"
          size="icon"
          onClick={() => setFilterOpen(!filterOpen)}
          className={`relative shrink-0 h-11 w-11 shadow-sm touch-manipulation ${filterOpen ? 'bg-primary/10 border-primary/50' : ''}`}
          aria-label="Filters"
        >
          <SlidersHorizontal className="h-4 w-4" />
          {activeFilterCount > 0 && (
            <span className="absolute -top-1.5 -right-1.5 h-5 w-5 rounded-full bg-primary text-[10px] font-bold text-primary-foreground flex items-center justify-center border-2 border-background">
              {activeFilterCount}
            </span>
          )}
        </Button>
      </div>

      {/* Collapsible Filters on Mobile / Always visible inline on Desktop */}
      <div className={`${filterOpen ? 'block' : 'hidden'} md:block`}>
        <Card className="bg-muted/30 shrink-0">
          <CardContent className="p-2 md:pt-4 md:p-6 pb-2 md:pb-4">
            <div className="grid grid-cols-2 md:flex md:flex-row flex-nowrap items-end gap-2 md:overflow-x-auto w-full">
              {/* Desktop Search (Hidden on Mobile) */}
              <div className="hidden md:block md:col-span-1 w-full md:min-w-42.5 shrink-0 space-y-1">
                <label className="text-xs md:text-sm font-medium">{tc('search')}</label>
                <div className="relative">
                  <Search className="absolute left-2 top-2.5 h-3 w-3 md:h-4 md:w-4 text-muted-foreground" />
                  <Input
                    placeholder={t('search_placeholder')}
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="pl-7 md:pl-8 h-8 md:h-9 text-xs md:text-sm bg-background"
                  />
                </div>
              </div>

              <div className="col-span-1 w-full md:min-w-37.5 shrink-0 space-y-1">
                <label className="text-xs md:text-sm font-medium">{tc('status')}</label>
                <Select value={filterStatus} onValueChange={setFilterStatus}>
                  <SelectTrigger className="h-8 md:h-9 text-xs md:text-sm bg-background">
                    <SelectValue placeholder={t('all_statuses')} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">{t('all_statuses')}</SelectItem>
                    <SelectItem value="Completed">{t('completed')}</SelectItem>
                    <SelectItem value="Cancelled">{t('cancelled')}</SelectItem>
                    <SelectItem value="Refunded">{t('refunded')}</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="col-span-1 w-full md:min-w-37.5 shrink-0 space-y-1">
                <label className="text-xs md:text-sm font-medium">{tc('payment')}</label>
                <Select value={filterPaymentMethod} onValueChange={setFilterPaymentMethod}>
                  <SelectTrigger className="h-8 md:h-9 text-xs md:text-sm bg-background">
                    <SelectValue placeholder={t('all_methods')} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">{t('all_methods')}</SelectItem>
                    <SelectItem value="Cash">{t('cash')}</SelectItem>
                    <SelectItem value="UPI">{t('upi')}</SelectItem>
                    <SelectItem value="Due">{t('due')}</SelectItem>
                    <SelectItem value="Prepaid">{t('prepaid')}</SelectItem>

                  </SelectContent>
                </Select>
              </div>

              <div className="col-span-2 md:col-span-1 w-full md:min-w-30 shrink-0 mt-1 md:mt-0">
                <Button
                  variant="outline"
                  onClick={onReset}
                  className="h-8 md:h-9 w-full gap-2 text-xs md:text-sm bg-background"
                >
                  <Filter className="w-3 h-3 md:w-4 md:h-4" />
                  {t('reset_filters')}
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
