# MenuDatePicker

A lightweight, Grammy Menu-compatible date picker for Telegram bots built with grammY.

> **Note**: This is a TypeScript port and adaptation of the [telegram-inline-calendar](https://github.com/VDS13/telegram-inline-calendar) project, specifically redesigned for Grammy Menu dynamic ranges and modern TypeScript development.

## Features

- 🎯 **Grammy Menu Native**: Built specifically for dynamic MenuRange integration
- 🌐 **Internationalized**: Supports EN/ES/IT/RU with dayjs localization
- ⚡ **Lightweight**: ~300 lines vs 600+ in traditional calendar implementations
- 🔄 **Stateless**: No side effects, deterministic rendering for Grammy Menu compatibility
- 📱 **Mobile-Friendly**: Optimized button layout for Telegram interfaces
- 🎨 **Customizable**: Date ranges, start week day, and format options

## Quick Start

```typescript
import { createMenuDatePicker, MenuDatePicker } from '../lib/menu-date-picker';

// In your Grammy Menu dynamic range
.dynamic(async (ctx, range) => {
  // Get or create picker state
  const state = ctx.session.datePickerState || MenuDatePicker.createDefaultState();
  
  // Create date picker
  const picker = createMenuDatePicker({ 
    language: ctx.i18n.languageCode,
    minDate: '2024-01-01',
    maxDate: '2025-12-31'
  });
  
  // Return the date picker range
  return picker.createDatePicker(
    state,
    async (selectedDate) => {
      // Handle date selection
      ctx.session.selectedDate = selectedDate;
      delete ctx.session.datePickerState;
      await ctx.menu.update();
    },
    ctx
  );
})
```

## API Reference

### MenuDatePicker Class

#### Constructor Options

```typescript
interface DatePickerOptions {
  language?: string;        // Default: 'en'
  dateFormat?: string;      // Default: 'YYYY-MM-DD'
  minDate?: string;         // Minimum selectable date (YYYY-MM-DD)
  maxDate?: string;         // Maximum selectable date (YYYY-MM-DD)
  startWeekDay?: number;    // 0 = Sunday, 1 = Monday (default: 1)
}
```

#### State Management

```typescript
interface DatePickerState {
  currentMonth: number;     // 0-11 (January = 0)
  currentYear: number;
  selectedDate?: string;    // YYYY-MM-DD format
  mode: 'month' | 'year';   // Current picker mode
}

// Create default state
const state = MenuDatePicker.createDefaultState();

// Navigation helpers
const newState = MenuDatePicker.navigateMonth(state, 'next');
const yearState = MenuDatePicker.navigateYear(state, 'prev');
const modeState = MenuDatePicker.toggleMode(state);
```

#### Core Methods

```typescript
// Main method - returns MenuRange for Grammy Menu
createDatePicker(
  state: DatePickerState,
  onDateSelect: (date: string) => void | Promise<void>,
  ctx: MyContext
): MenuRange<MyContext>

// Factory function
createMenuDatePicker(options?: DatePickerOptions): MenuDatePicker
```

## Session Integration

Add the date picker state to your session type:

```typescript
// In SessionData.ts
import { DatePickerState } from '../lib/menu-date-picker';

interface SessionData {
  // ... existing fields
  datePickerState?: DatePickerState;
}
```

## Internationalization

The date picker integrates with your existing i18n setup. Add these translations to your locale files:

```yaml
# en.yaml, ru.yaml, es.yml, it.yaml
datePicker:
  selectDate: "Select a date:"
  backToMonth: "🔙 Back"
  navigation:
    prevMonth: "‹"
    nextMonth: "›"
    prevYear: "‹‹"
    nextYear: "››"
```

## Usage Patterns

### Transaction Date Editing

```typescript
function createEditDateMenu() {
  return new Menu<MyContext>(MENUS.EDIT_DATE)
    .dynamic(async (ctx, range) => {
      const state = ctx.session.datePickerState || MenuDatePicker.createDefaultState();
      const picker = createMenuDatePicker({ language: ctx.i18n.languageCode });
      
      return picker.createDatePicker(
        state,
        async (selectedDate) => {
          // Update transaction date
          await updateTransaction(ctx, { date: selectedDate });
          delete ctx.session.datePickerState;
          await ctx.menu.update();
        },
        ctx
      );
    })
    .text('🔙 Cancel', closeMenu);
}
```

### Date Range Selection

```typescript
const picker = createMenuDatePicker({
  language: ctx.i18n.languageCode,
  minDate: '2024-01-01',
  maxDate: '2024-12-31',
  startWeekDay: 1 // Monday start
});
```

## Technical Details

### Grammy Menu Compatibility

The MenuDatePicker is designed specifically for Grammy Menu's dynamic range system:

- **Stateless**: All state is passed in, no internal state management
- **Deterministic**: Same input always produces same output
- **No Side Effects**: Pure functions that don't modify external state
- **Callback-Based**: Uses Grammy Menu's callback system for interactions

### State Persistence

State is stored in the session and automatically managed:

```typescript
// State is automatically saved on navigation
ctx.session.datePickerState = newState;

// State is cleared on date selection
delete ctx.session.datePickerState;
```

### Localization

Uses dayjs for date formatting and localization:

```typescript
// Month names and day abbreviations are automatically localized
const monthName = dayjs().locale(language).format('MMMM YYYY');
const dayName = dayjs().day(dayIndex).locale(language).format('dd');
```

## Migration from Calendar

If migrating from the existing calendar implementation:

1. Replace calendar imports with MenuDatePicker
2. Update session type to include `datePickerState`
3. Replace calendar usage in dynamic ranges
4. Add date picker translations to locale files

```typescript
// Before
import { createCalendar } from '../lib/calendar/calendar';
const calendar = createCalendar();
calendar.startNavCalendar(ctx);

// After
import { createMenuDatePicker, MenuDatePicker } from '../lib/menu-date-picker';
const picker = createMenuDatePicker({ language: ctx.i18n.languageCode });
return picker.createDatePicker(state, onDateSelect, ctx);
```

## Performance

- **Lightweight**: ~300 lines of code
- **Efficient**: No unnecessary re-renders or API calls
- **Memory-friendly**: Stateless design prevents memory leaks
- **Fast**: Optimized for Telegram's inline keyboard constraints