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
 * @interface PiggyBankUpdate
 */
export interface PiggyBankUpdate {
    /**
     * 
     * @type {string}
     * @memberof PiggyBankUpdate
     */
    name?: string;
    /**
     * The ID of the asset account this piggy bank is connected to.
     * @type {string}
     * @memberof PiggyBankUpdate
     */
    account_id?: string;
    /**
     * 
     * @type {string}
     * @memberof PiggyBankUpdate
     */
    currency_id?: string;
    /**
     * 
     * @type {string}
     * @memberof PiggyBankUpdate
     */
    currency_code?: string;
    /**
     * 
     * @type {string}
     * @memberof PiggyBankUpdate
     */
    target_amount?: string | null;
    /**
     * 
     * @type {string}
     * @memberof PiggyBankUpdate
     */
    current_amount?: string;
    /**
     * The date you started with this piggy bank.
     * @type {string}
     * @memberof PiggyBankUpdate
     */
    start_date?: string;
    /**
     * The date you intend to finish saving money.
     * @type {string}
     * @memberof PiggyBankUpdate
     */
    target_date?: string | null;
    /**
     * 
     * @type {number}
     * @memberof PiggyBankUpdate
     */
    order?: number;
    /**
     * 
     * @type {boolean}
     * @memberof PiggyBankUpdate
     */
    active?: boolean;
    /**
     * 
     * @type {string}
     * @memberof PiggyBankUpdate
     */
    notes?: string | null;
    /**
     * The group ID of the group this object is part of. NULL if no group.
     * @type {string}
     * @memberof PiggyBankUpdate
     */
    object_group_id?: string | null;
    /**
     * The name of the group. NULL if no group.
     * @type {string}
     * @memberof PiggyBankUpdate
     */
    object_group_title?: string | null;
}


