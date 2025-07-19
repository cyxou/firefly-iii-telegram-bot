# Firefly III Telegram Bot Project Brief

## Core Identity
**Purpose**: Telegram interface for Firefly III personal finance management
**Primary Value**: Mobile-first access to financial tracking through conversational UI

## Key Requirements
- Transaction CRUD operations via natural language
- Account/category management with caching
- Multi-language support (EN/ES/IT/RU)
- Persistent session state across interactions
- Secure API integration with Firefly III

## Technical Foundation
- **Runtime**: Node.js 18+ with TypeScript 5+
- **Bot Framework**: Grammy.js with middleware architecture
- **API Layer**: Auto-generated OpenAPI client
- **Session Storage**: File-based (@grammyjs/storage-file)
- **Deployment**: Docker containerization

## Version Matrix
| Component       | Version      | Compatibility       |
|-----------------|--------------|---------------------|
| Bot Core        | 2.1.0        | Firefly III ≥6.0.30 |
| Firefly III API | v1.5.6       | OpenAPI 3.0         |
