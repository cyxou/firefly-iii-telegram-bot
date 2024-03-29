/* tslint:disable */
/* eslint-disable */
/**
 * Firefly III API v2.0.10
 * This is the documentation of the Firefly III API. You can find accompanying documentation on the website of Firefly III itself (see below). Please report any bugs or issues. You may use the \"Authorize\" button to try the API below. This file was last generated on 2023-10-15T12:13:25+00:00  Please keep in mind that the demo site does not accept requests from curl, colly, wget, etc. You must use a browser or a tool like Postman to make requests. Too many script kiddies out there, sorry about that. 
 *
 * The version of the OpenAPI document: 2.0.10
 * Contact: james@firefly-iii.org
 *
 * NOTE: This class is auto generated by OpenAPI Generator (https://openapi-generator.tech).
 * https://openapi-generator.tech
 * Do not edit the class manually.
 */



/**
 * The type of thing this trigger responds to. A limited set is possible
 * @export
 * @enum {string}
 */

export enum RuleTriggerKeyword {
    FromAccountStarts = 'from_account_starts',
    FromAccountEnds = 'from_account_ends',
    FromAccountIs = 'from_account_is',
    FromAccountContains = 'from_account_contains',
    ToAccountStarts = 'to_account_starts',
    ToAccountEnds = 'to_account_ends',
    ToAccountIs = 'to_account_is',
    ToAccountContains = 'to_account_contains',
    AmountLess = 'amount_less',
    AmountExactly = 'amount_exactly',
    AmountMore = 'amount_more',
    DescriptionStarts = 'description_starts',
    DescriptionEnds = 'description_ends',
    DescriptionContains = 'description_contains',
    DescriptionIs = 'description_is',
    TransactionType = 'transaction_type',
    CategoryIs = 'category_is',
    BudgetIs = 'budget_is',
    TagIs = 'tag_is',
    CurrencyIs = 'currency_is',
    HasAttachments = 'has_attachments',
    HasNoCategory = 'has_no_category',
    HasAnyCategory = 'has_any_category',
    HasNoBudget = 'has_no_budget',
    HasAnyBudget = 'has_any_budget',
    HasNoTag = 'has_no_tag',
    HasAnyTag = 'has_any_tag',
    NotesContains = 'notes_contains',
    NotesStart = 'notes_start',
    NotesEnd = 'notes_end',
    NotesAre = 'notes_are',
    NoNotes = 'no_notes',
    AnyNotes = 'any_notes',
    SourceAccountIs = 'source_account_is',
    DestinationAccountIs = 'destination_account_is',
    SourceAccountStarts = 'source_account_starts'
}



