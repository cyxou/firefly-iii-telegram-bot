import dayjs from 'dayjs';
import { MenuRange } from '@grammyjs/menu';
import type { MyContext } from '../../types/MyContext';

export interface DatePickerState {
  currentMonth: number;    // 0-11 (January = 0)
  currentYear: number;
  selectedDate?: string;   // YYYY-MM-DD format
  mode: 'month' | 'year';  // Current picker mode
}

export interface DatePickerOptions {
  language?: string;
  dateFormat?: string;     // Default: 'YYYY-MM-DD'
  minDate?: string;        // YYYY-MM-DD format
  maxDate?: string;        // YYYY-MM-DD format
  startWeekDay?: number;   // 0 = Sunday, 1 = Monday
}

export interface DateSelectCallback {
  (date: string): void | Promise<void>;
}

export class MenuDatePicker {
  private options: Required<DatePickerOptions>;

  constructor(options: DatePickerOptions = {}) {
    this.options = {
      language: options.language ?? 'en',
      dateFormat: options.dateFormat ?? 'YYYY-MM-DD',
      minDate: options.minDate ?? '',
      maxDate: options.maxDate ?? '',
      startWeekDay: options.startWeekDay ?? 1, // Monday by default
    };
  }

  /**
   * Creates a complete date picker as a MenuRange for Grammy Menu dynamic ranges
   */
  createDatePicker(
    state: DatePickerState,
    onDateSelect: DateSelectCallback,
    ctx: MyContext
  ): MenuRange<MyContext> {
    const range = new MenuRange<MyContext>();

    if (state.mode === 'year') {
      return this.createYearSelector(state, ctx, range);
    } else {
      return this.createMonthView(state, onDateSelect, ctx, range);
    }
  }

  /**
   * Creates the month view with calendar grid
   */
  private createMonthView(
    state: DatePickerState,
    onDateSelect: DateSelectCallback,
    ctx: MyContext,
    range: MenuRange<MyContext>
  ): MenuRange<MyContext> {
    // Header with navigation and month/year display
    this.addNavigationHeader(state, ctx, range);
    
    // Week days header
    this.addWeekDaysHeader(ctx, range);
    
    // Calendar grid with dates
    this.addCalendarGrid(state, onDateSelect, ctx, range);
    
    return range.row();
  }

  /**
   * Creates the year selector view
   */
  private createYearSelector(
    state: DatePickerState,
    ctx: MyContext,
    range: MenuRange<MyContext>
  ): MenuRange<MyContext> {
    const currentYear = state.currentYear;
    const startYear = Math.floor(currentYear / 10) * 10;
    
    // Header
    range.row()
      .text('‹‹', async (ctx) => {
        const newState = { ...state, currentYear: startYear - 10 };
        ctx.session.datePickerState = newState;
        await ctx.menu.update();
      })
      .text(`${startYear}-${startYear + 9}`, async () => {
        // No operation for display text
      })
      .text('››', async (ctx) => {
        const newState = { ...state, currentYear: startYear + 10 };
        ctx.session.datePickerState = newState;
        await ctx.menu.update();
      });
    
    // Year grid (2 rows of 5 years each)
    for (let row = 0; row < 2; row++) {
      range.row();
      for (let col = 0; col < 5; col++) {
        const year = startYear + (row * 5) + col;
        const isCurrentYear = year === currentYear;
        const yearText = isCurrentYear ? `[${year}]` : year.toString();
        
        if (this.isYearInRange(year)) {
          range.text(yearText, async (ctx) => {
            const newState = MenuDatePicker.selectYear(state, year);
            ctx.session.datePickerState = newState;
            await ctx.menu.update();
          });
        } else {
          range.text(' ', async () => {
            // No operation for empty cells
          });
        }
      }
    }
    
    // Back to month view button
    range.row().text('🔙 Back', async (ctx) => {
      const newState = { ...state, mode: 'month' as const };
      ctx.session.datePickerState = newState;
      await ctx.menu.update();
    });
    
    return range;
  }

  /**
   * Adds navigation header with prev/next buttons and month/year display
   */
  private addNavigationHeader(
    state: DatePickerState,
    ctx: MyContext,
    range: MenuRange<MyContext>
  ): void {
    const currentDate = dayjs().year(state.currentYear).month(state.currentMonth);
    const monthName = currentDate.locale(this.options.language).format('MMMM YYYY');
    
    range.row()
      .text('‹', async (ctx) => {
        const newState = MenuDatePicker.navigateMonth(state, 'prev');
        ctx.session.datePickerState = newState;
        await ctx.menu.update();
      })
      .text(monthName, async (ctx) => {
        const newState = { ...state, mode: 'year' as const };
        ctx.session.datePickerState = newState;
        await ctx.menu.update();
      })
      .text('›', async (ctx) => {
        const newState = MenuDatePicker.navigateMonth(state, 'next');
        ctx.session.datePickerState = newState;
        await ctx.menu.update();
      });
  }

  /**
   * Adds week days header row
   */
  private addWeekDaysHeader(ctx: MyContext, range: MenuRange<MyContext>): void {
    const weekDays = this.getLocalizedWeekDays();
    
    range.row();
    for (const day of weekDays) {
      range.text(day, async () => {
        // No operation for week day headers
      });
    }
  }

  /**
   * Adds the calendar grid with clickable date buttons
   */
  private addCalendarGrid(
    state: DatePickerState,
    onDateSelect: DateSelectCallback,
    ctx: MyContext,
    range: MenuRange<MyContext>
  ): void {
    const currentDate = dayjs().year(state.currentYear).month(state.currentMonth);
    const firstDay = currentDate.startOf('month');
    const lastDay = currentDate.endOf('month');
    const daysInMonth = lastDay.date();
    
    // Calculate starting position based on start week day
    let startWeekDay = firstDay.day(); // 0 = Sunday, 1 = Monday, etc.
    if (this.options.startWeekDay === 1) {
      // Adjust for Monday start (0 = Monday, 6 = Sunday)
      startWeekDay = startWeekDay === 0 ? 6 : startWeekDay - 1;
    }
    
    let currentDay = 1;
    let weekCount = 0;
    
    // Generate calendar weeks
    while (currentDay <= daysInMonth) {
      range.row();
      
      for (let dayOfWeek = 0; dayOfWeek < 7; dayOfWeek++) {
        if (weekCount === 0 && dayOfWeek < startWeekDay) {
          // Empty cells before first day of month
          range.text(' ', async () => {
            // No operation for empty cells
          });
        } else if (currentDay > daysInMonth) {
          // Empty cells after last day of month
          range.text(' ', async () => {
            // No operation for empty cells
          });
        } else {
          // Actual date button
          const dateStr = currentDate.date(currentDay).format('YYYY-MM-DD');
          const isSelectable = this.isDateSelectable(dateStr);
          const isToday = this.isToday(dateStr);
          
          if (isSelectable) {
            // Apply bold formatting for today's date
            const displayText = isToday ? `${currentDay}*` : currentDay.toString();
            
            range.text(
              displayText,
              async () => {
                await onDateSelect(dateStr);
              }
            );
          } else {
            range.text(' ', async () => {
              // No operation for disabled dates
            });
          }
          
          currentDay++;
        }
      }
      
      weekCount++;
      
      // Safety check to prevent infinite loops
      if (weekCount > 6) break;
    }
  }

  /**
   * Gets localized week day abbreviations
   */
  private getLocalizedWeekDays(): string[] {
    const weekDays = [];
    const startDay = this.options.startWeekDay;
    
    // Get localized day names
    for (let i = 0; i < 7; i++) {
      const dayIndex = (startDay + i) % 7;
      const dayName = dayjs().day(dayIndex).locale(this.options.language).format('dd');
      weekDays.push(dayName);
    }
    
    return weekDays;
  }

  /**
   * Checks if a date is selectable based on min/max constraints
   */
  private isDateSelectable(dateStr: string): boolean {
    const date = dayjs(dateStr);
    
    if (this.options.minDate && date.isBefore(dayjs(this.options.minDate))) {
      return false;
    }
    
    if (this.options.maxDate && date.isAfter(dayjs(this.options.maxDate))) {
      return false;
    }
    
    return true;
  }

  /**
   * Checks if a date is today
   */
  private isToday(dateStr: string): boolean {
    const date = dayjs(dateStr);
    const today = dayjs();
    
    return date.isSame(today, 'day');
  }

  /**
   * Checks if a year is within the allowed range
   */
  private isYearInRange(year: number): boolean {
    if (this.options.minDate && year < dayjs(this.options.minDate).year()) {
      return false;
    }
    
    if (this.options.maxDate && year > dayjs(this.options.maxDate).year()) {
      return false;
    }
    
    return true;
  }

  /**
   * Navigation helper: move to previous/next month
   */
  static navigateMonth(state: DatePickerState, direction: 'prev' | 'next'): DatePickerState {
    const currentDate = dayjs().year(state.currentYear).month(state.currentMonth);
    const newDate = direction === 'prev' 
      ? currentDate.subtract(1, 'month')
      : currentDate.add(1, 'month');
    
    return {
      ...state,
      currentMonth: newDate.month(),
      currentYear: newDate.year(),
    };
  }

  /**
   * Navigation helper: move to previous/next year
   */
  static navigateYear(state: DatePickerState, direction: 'prev' | 'next'): DatePickerState {
    const offset = direction === 'prev' ? -1 : 1;
    
    return {
      ...state,
      currentYear: state.currentYear + offset,
    };
  }

  /**
   * Toggle between month and year selection modes
   */
  static toggleMode(state: DatePickerState): DatePickerState {
    return {
      ...state,
      mode: state.mode === 'month' ? 'year' : 'month',
    };
  }

  /**
   * Set specific year and return to month mode
   */
  static selectYear(state: DatePickerState, year: number): DatePickerState {
    return {
      ...state,
      currentYear: year,
      mode: 'month',
    };
  }

  /**
   * Creates default state for current date
   */
  static createDefaultState(): DatePickerState {
    const now = dayjs();
    return {
      currentMonth: now.month(),
      currentYear: now.year(),
      mode: 'month',
    };
  }
}

/**
 * Factory function for creating a MenuDatePicker instance
 */
export function createMenuDatePicker(options?: DatePickerOptions): MenuDatePicker {
  return new MenuDatePicker(options);
}

/**
 * Helper function to handle date picker callbacks in Grammy Menu
 */
export function handleDatePickerCallback(
  ctx: MyContext,
  callbackData: string,
  onDateSelect: DateSelectCallback
): boolean {
  const parts = callbackData.split('_');
  
  if (parts[0] !== 'dp') {
    return false; // Not a date picker callback
  }
  
  const action = parts[1];
  const data = parts.slice(2);
  
  // Get current state from session or create default
  let state = ctx.session.datePickerState || MenuDatePicker.createDefaultState();
  
  switch (action) {
    case 'date': {
      // Date selected
      const selectedDate = data.join('-');
      onDateSelect(selectedDate);
      delete ctx.session.datePickerState;
      return true;
    }
      
    case 'nav': {
      // Navigation action
      const direction = data[0] as 'prev' | 'next';
      const type = data[1];
      
      if (type === 'month') {
        state = MenuDatePicker.navigateMonth(state, direction);
      } else if (type === 'year') {
        const yearOffset = parseInt(data[2]) || 0;
        state = { ...state, currentYear: yearOffset };
      }
      
      ctx.session.datePickerState = state;
      return true;
    }
      
    case 'mode': {
      // Mode toggle
      const newMode = data[0] as 'month' | 'year';
      state = { ...state, mode: newMode };
      ctx.session.datePickerState = state;
      return true;
    }
      
    case 'select':
      // Year selection
      if (data[0] === 'year') {
        const year = parseInt(data[1]);
        state = MenuDatePicker.selectYear(state, year);
        ctx.session.datePickerState = state;
        return true;
      }
      break;
      
    case 'noop':
      // No operation (empty cells)
      return true;
  }
  
  return false;
}
