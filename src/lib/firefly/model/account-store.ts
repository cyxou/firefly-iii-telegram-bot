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


import { AccountRoleProperty } from './account-role-property';
import { CreditCardType } from './credit-card-type';
import { InterestPeriod } from './interest-period';
import { LiabilityDirection } from './liability-direction';
import { LiabilityType } from './liability-type';
import { ShortAccountTypeProperty } from './short-account-type-property';

/**
 * 
 * @export
 * @interface AccountStore
 */
export interface AccountStore {
    /**
     * 
     * @type {string}
     * @memberof AccountStore
     */
    name: string;
    /**
     * 
     * @type {ShortAccountTypeProperty}
     * @memberof AccountStore
     */
    type: ShortAccountTypeProperty;
    /**
     * 
     * @type {string}
     * @memberof AccountStore
     */
    iban?: string | null;
    /**
     * 
     * @type {string}
     * @memberof AccountStore
     */
    bic?: string | null;
    /**
     * 
     * @type {string}
     * @memberof AccountStore
     */
    account_number?: string | null;
    /**
     * Represents the opening balance, the initial amount this account holds.
     * @type {string}
     * @memberof AccountStore
     */
    opening_balance?: string;
    /**
     * Represents the date of the opening balance.
     * @type {string}
     * @memberof AccountStore
     */
    opening_balance_date?: string | null;
    /**
     * 
     * @type {string}
     * @memberof AccountStore
     */
    virtual_balance?: string;
    /**
     * Use either currency_id or currency_code. Defaults to the user\'s default currency.
     * @type {string}
     * @memberof AccountStore
     */
    currency_id?: string;
    /**
     * Use either currency_id or currency_code. Defaults to the user\'s default currency.
     * @type {string}
     * @memberof AccountStore
     */
    currency_code?: string;
    /**
     * If omitted, defaults to true.
     * @type {boolean}
     * @memberof AccountStore
     */
    active?: boolean;
    /**
     * Order of the account
     * @type {number}
     * @memberof AccountStore
     */
    order?: number;
    /**
     * If omitted, defaults to true.
     * @type {boolean}
     * @memberof AccountStore
     */
    include_net_worth?: boolean;
    /**
     * 
     * @type {AccountRoleProperty}
     * @memberof AccountStore
     */
    account_role?: AccountRoleProperty | null;
    /**
     * 
     * @type {CreditCardType}
     * @memberof AccountStore
     */
    credit_card_type?: CreditCardType | null;
    /**
     * Mandatory when the account_role is ccAsset. Moment at which CC payment installments are asked for by the bank.
     * @type {string}
     * @memberof AccountStore
     */
    monthly_payment_date?: string | null;
    /**
     * 
     * @type {LiabilityType}
     * @memberof AccountStore
     */
    liability_type?: LiabilityType | null;
    /**
     * 
     * @type {LiabilityDirection}
     * @memberof AccountStore
     */
    liability_direction?: LiabilityDirection | null;
    /**
     * Mandatory when type is liability. Interest percentage.
     * @type {string}
     * @memberof AccountStore
     */
    interest?: string | null;
    /**
     * 
     * @type {InterestPeriod}
     * @memberof AccountStore
     */
    interest_period?: InterestPeriod | null;
    /**
     * 
     * @type {string}
     * @memberof AccountStore
     */
    notes?: string | null;
    /**
     * Latitude of the accounts\'s location, if applicable. Can be used to draw a map.
     * @type {number}
     * @memberof AccountStore
     */
    latitude?: number | null;
    /**
     * Latitude of the accounts\'s location, if applicable. Can be used to draw a map.
     * @type {number}
     * @memberof AccountStore
     */
    longitude?: number | null;
    /**
     * Zoom level for the map, if drawn. This to set the box right. Unfortunately this is a proprietary value because each map provider has different zoom levels.
     * @type {number}
     * @memberof AccountStore
     */
    zoom_level?: number | null;
}


