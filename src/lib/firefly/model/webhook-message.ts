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
 * 
 * @export
 * @interface WebhookMessage
 */
export interface WebhookMessage {
    /**
     * 
     * @type {string}
     * @memberof WebhookMessage
     */
    created_at?: string;
    /**
     * 
     * @type {string}
     * @memberof WebhookMessage
     */
    updated_at?: string;
    /**
     * If this message is sent yet.
     * @type {boolean}
     * @memberof WebhookMessage
     */
    sent?: boolean;
    /**
     * If this message has errored out.
     * @type {boolean}
     * @memberof WebhookMessage
     */
    errored?: boolean;
    /**
     * The ID of the webhook this message belongs to.
     * @type {string}
     * @memberof WebhookMessage
     */
    webhook_id?: string;
    /**
     * Long UUID string for identification of this webhook message.
     * @type {string}
     * @memberof WebhookMessage
     */
    uuid?: string;
    /**
     * The actual message that is sent or will be sent as JSON string.
     * @type {string}
     * @memberof WebhookMessage
     */
    string?: string | null;
}


