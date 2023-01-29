/* tslint:disable */
/* eslint-disable */
/**
 * Firefly III API v1.5.6
 * This is the documentation of the Firefly III API. You can find accompanying documentation on the website of Firefly III itself (see below). Please report any bugs or issues. You may use the \"Authorize\" button to try the API below. This file was last generated on 2022-04-04T03:54:41+00:00 
 *
 * The version of the OpenAPI document: 1.5.6
 * Contact: james@firefly-iii.org
 *
 * NOTE: This class is auto generated by OpenAPI Generator (https://openapi-generator.tech).
 * https://openapi-generator.tech
 * Do not edit the class manually.
 */



/**
 * 
 * @export
 * @interface RecurrenceTransactionStore
 */
export interface RecurrenceTransactionStore {
    /**
     * 
     * @type {string}
     * @memberof RecurrenceTransactionStore
     */
    description: string;
    /**
     * Amount of the transaction.
     * @type {string}
     * @memberof RecurrenceTransactionStore
     */
    amount: string;
    /**
     * Foreign amount of the transaction.
     * @type {string}
     * @memberof RecurrenceTransactionStore
     */
    foreign_amount?: string | null;
    /**
     * Submit either a currency_id or a currency_code.
     * @type {string}
     * @memberof RecurrenceTransactionStore
     */
    currency_id?: string;
    /**
     * Submit either a currency_id or a currency_code.
     * @type {string}
     * @memberof RecurrenceTransactionStore
     */
    currency_code?: string;
    /**
     * Submit either a foreign_currency_id or a foreign_currency_code, or neither.
     * @type {string}
     * @memberof RecurrenceTransactionStore
     */
    foreign_currency_id?: string | null;
    /**
     * Submit either a foreign_currency_id or a foreign_currency_code, or neither.
     * @type {string}
     * @memberof RecurrenceTransactionStore
     */
    foreign_currency_code?: string | null;
    /**
     * The budget ID for this transaction.
     * @type {string}
     * @memberof RecurrenceTransactionStore
     */
    budget_id?: string;
    /**
     * Category ID for this transaction.
     * @type {string}
     * @memberof RecurrenceTransactionStore
     */
    category_id?: string;
    /**
     * ID of the source account.
     * @type {string}
     * @memberof RecurrenceTransactionStore
     */
    source_id: string;
    /**
     * ID of the destination account.
     * @type {string}
     * @memberof RecurrenceTransactionStore
     */
    destination_id: string;
    /**
     * Array of tags.
     * @type {Array<string>}
     * @memberof RecurrenceTransactionStore
     */
    tags?: Array<string> | null;
    /**
     * Optional.
     * @type {string}
     * @memberof RecurrenceTransactionStore
     */
    piggy_bank_id?: string | null;
}


