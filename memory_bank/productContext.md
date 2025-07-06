# Product Context: Why & How

## Problem Space
**Core Need**: Enable Firefly III users to manage finances via Telegram's mobile interface  
**UX Differentiators**:
- Natural language processing for transaction amounts (e.g., "15.50+2.25 Coffee")
- Context-aware conversation flows with session persistence
- Zero-configuration default account setup

## Feature Hierarchy
1. **Transaction Management** (Core)
   - Mathematical expression parsing
   - Quick text-based entry
   - Menu-driven editing
2. **Account System**
   - Type-specific filtering (Asset/Expense/Revenue)
   - Default account configuration
   - Balance tracking
3. **Category System**
   - Bulk creation/deletion
   - Spending/earning analytics
   - Monthly breakdowns

## User Journey Map
```mermaid
graph TD
    A[Start Chat] --> B[Settings Configuration]
    B --> C{Valid Credentials?}
    C -->|Yes| D[Transaction Flow]
    C -->|No| B
    D --> E[Create/Edit/List]
    E --> F[Persistent Session Storage]
    F --> G[API Sync]
