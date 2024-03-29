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


import { WebhookDelivery } from './webhook-delivery';
import { WebhookResponse } from './webhook-response';
import { WebhookTrigger } from './webhook-trigger';

/**
 * 
 * @export
 * @interface Webhook
 */
export interface Webhook {
    /**
     * 
     * @type {string}
     * @memberof Webhook
     */
    created_at?: string;
    /**
     * 
     * @type {string}
     * @memberof Webhook
     */
    updated_at?: string;
    /**
     * Boolean to indicate if the webhook is active
     * @type {boolean}
     * @memberof Webhook
     */
    active?: boolean;
    /**
     * A title for the webhook for easy recognition.
     * @type {string}
     * @memberof Webhook
     */
    title: string;
    /**
     * A 24-character secret for the webhook. It\'s generated by Firefly III when saving a new webhook. If you submit a new secret through the PUT endpoint it will generate a new secret for the selected webhook, a new secret bearing no relation to whatever you just submitted.
     * @type {string}
     * @memberof Webhook
     */
    secret?: string;
    /**
     * 
     * @type {WebhookTrigger}
     * @memberof Webhook
     */
    trigger: WebhookTrigger;
    /**
     * 
     * @type {WebhookResponse}
     * @memberof Webhook
     */
    response: WebhookResponse;
    /**
     * 
     * @type {WebhookDelivery}
     * @memberof Webhook
     */
    delivery: WebhookDelivery;
    /**
     * The URL of the webhook. Has to start with `https`.
     * @type {string}
     * @memberof Webhook
     */
    url: string;
}


