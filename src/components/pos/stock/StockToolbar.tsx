'use client';

import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from '@/components/ui/dropdown-menu';
import {
  Package,
  Plus,
  Search,
  Filter,
  ArrowUpDown,
  X,
  Upload,
  BarChart2,
  ChevronDown,
} from 'lucide-react';
import type { SortField, SortOrder, StockFilter } from './types';

export interface StockToolbarProps {
  itemCount: number;
  searchQuery: string;
  onSearchChange: (query: string) => void;
  onClearSearch: () => void;
  stockFilter: StockFilter;
  onStockFilterChange: (v: StockFilter) => void;
  categoryFilter: string;
  onCategoryFilterChange: (v: string) => void;
  categories: string[];
  sortField: SortField;
  sortOrder: SortOrder;
  onSortChange: (field: SortField, order: SortOrder) => void;
  onStatistics?: () => void;
  onBulkUpdate: () => void;
  onAddProduct?: () => void;
  /** Rendered between header and search filters (e.g. summary cards) */
  children?: React.ReactNode;
}

export function StockToolbar({
  itemCount,
  searchQuery,
  onSearchChange,
  onClearSearch,
  stockFilter,
  onStockFilterChange,
  categoryFilter,
  onCategoryFilterChange,
  categories,
  sortField,
  sortOrder,
  onSortChange,
  onStatistics,
  onBulkUpdate,
  onAddProduct,
  children,
}: StockToolbarProps) {
  const t = useTranslations('Stock');
  const tc = useTranslations('Common');

  return (
    <div className="flex flex-col gap-2 shrink-0">
      {/* Header */}
      <div className="flex items-center justify-between gap-2">
        <div>
          <h1 className="text-lg md:text-2xl font-bold flex items-center gap-2">
            <Package className="w-5 h-5" />
            {t('title')}
          </h1>
          <p className="text-xs text-muted-foreground">
            {itemCount} {t('items')}
          </p>
        </div>

        {/* Desktop Actions */}
        <div className="hidden sm:flex gap-1.5">
          <Button variant="outline" size="sm" onClick={onStatistics} className="gap-1 h-8 px-2">
            <BarChart2 className="w-4 h-4" />
            <span className="text-xs">{t('statistics')}</span>
          </Button>
          <Button variant="outline" size="sm" onClick={onBulkUpdate} className="gap-1 h-8 px-2">
            <Upload className="w-4 h-4" />
            <span className="text-xs">{t('bulk_update')}</span>
          </Button>
          <Button size="sm" onClick={onAddProduct} className="gap-1 h-8 px-2 bg-emerald-600 text-white hover:bg-emerald-700 dark:bg-emerald-500 dark:hover:bg-emerald-600">
            <Plus className="w-4 h-4" />
            <span className="text-xs">{t('add_item')}</span>
          </Button>
        </div>

        {/* Mobile Actions Dropdown */}
        <div className="sm:hidden">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button size="sm" className="h-8 px-2.5 bg-emerald-600 text-white hover:bg-emerald-700 dark:bg-emerald-500 dark:hover:bg-emerald-600 flex items-center gap-1.5 text-xs font-semibold">
                <span>{tc('actions') || 'Actions'}</span>
                <ChevronDown className="w-3.5 h-3.5" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={onAddProduct} className="gap-2">
                <Plus className="w-4 h-4 text-emerald-600 dark:text-emerald-500" />
                <span>{t('add_item')}</span>
              </DropdownMenuItem>
              <DropdownMenuItem onClick={onBulkUpdate} className="gap-2">
                <Upload className="w-4 h-4" />
                <span>{t('bulk_update')}</span>
              </DropdownMenuItem>
              <DropdownMenuItem onClick={onStatistics} className="gap-2">
                <BarChart2 className="w-4 h-4" />
                <span>{t('statistics')}</span>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {children}

      {/* Search & Filters */}
      <div className="flex flex-row w-full gap-2 items-center shrink-0">
        {/* Search */}
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder={t('search_placeholder')}
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            className="pl-9 h-9 w-full"
          />
          {searchQuery && (
            <Button
              variant="ghost"
              size="sm"
              className="absolute right-1 top-1/2 -translate-y-1/2 h-7 w-7 p-0"
              onClick={onClearSearch}
            >
              <X className="w-4 h-4" />
            </Button>
          )}
        </div>

        {/* Stock Filter */}
        <Select value={stockFilter} onValueChange={(v: StockFilter) => onStockFilterChange(v)}>
          <SelectTrigger className="w-9 h-9 p-0 justify-center sm:w-[140px] sm:h-9 sm:px-3 sm:justify-between shrink-0 [&>span:last-child]:hidden sm:[&>span:last-child]:inline-flex">
            <span className="hidden sm:inline">
              <SelectValue placeholder={t('stock_status')} />
            </span>
            <Filter className="h-4 w-4 sm:hidden" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t('all_items')}</SelectItem>
            <SelectItem value="low">{t('low_stock')}</SelectItem>
            <SelectItem value="out">{t('out_of_stock')}</SelectItem>
            <SelectItem value="inactive">{t('inactive')}</SelectItem>
          </SelectContent>
        </Select>

        {/* Category Filter */}
        <Select value={categoryFilter} onValueChange={onCategoryFilterChange} disabled={stockFilter === 'inactive'}>
          <SelectTrigger className="w-9 h-9 p-0 justify-center sm:w-[200px] sm:h-9 sm:px-3 sm:justify-between shrink-0 [&>span:last-child]:hidden sm:[&>span:last-child]:inline-flex">
            <span className="hidden sm:inline flex items-center gap-2">
              <Filter className="w-4 h-4 mr-2" />
              <SelectValue placeholder={t('all_categories')} />
            </span>
            <Package className="h-4 w-4 sm:hidden" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t('all_categories')}</SelectItem>
            {categories.map((cat) => (
              <SelectItem key={cat} value={cat}>
                {cat}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {/* Mobile-only Sort Button */}
        <Select
          value={`${sortField}-${sortOrder}`}
          onValueChange={(value) => {
            const [field, order] = value.split('-') as [SortField, SortOrder];
            onSortChange(field, order);
          }}
        >
          <SelectTrigger className="w-9 h-9 p-0 justify-center sm:hidden shrink-0 [&>span:last-child]:hidden">
            <ArrowUpDown className="h-4 w-4" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="name-asc">{t('item_name')} (A-Z)</SelectItem>
            <SelectItem value="name-desc">{t('item_name')} (Z-A)</SelectItem>
            <SelectItem value="stock-asc">{t('stock_level')} (L-H)</SelectItem>
            <SelectItem value="stock-desc">{t('stock_level')} (H-L)</SelectItem>
            <SelectItem value="price-asc">{t('sell_price')} (L-H)</SelectItem>
            <SelectItem value="price-desc">{t('sell_price')} (H-L)</SelectItem>
            <SelectItem value="category-asc">{tc('category')} (A-Z)</SelectItem>
            <SelectItem value="category-desc">{tc('category')} (Z-A)</SelectItem>
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}
