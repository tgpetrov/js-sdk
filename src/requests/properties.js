import { KinveyError } from '../errors';
import clone from 'lodash/clone';
import isPlainObject from 'lodash/isPlainObject';
const privateRequestPropertiesSymbol = Symbol();
const appVersionKey = 'appVersion';

class PrivateRequestProperties {
  constructor(properties = {}) {
    this.properties = properties;
  }

  get properties() {
    return this._properties;
  }

  set properties(properties) {
    this._properties = clone(properties, true);
  }

  addProperties(properties) {
    Object.keys(properties).forEach((key) => {
      const value = properties[key];

      if (value) {
        this.properties[key] = value;
      } else {
        delete this.properties[key];
      }
    });
  }

  clear() {
    this.properties = {};
  }

  clearProperty(key) {
    const properties = this.properties;

    if (key && properties.hasOwnProperty(key)) {
      delete properties[key];
    }
  }

  toJSON() {
    return clone(this.properties, true);
  }
}

/**
 * Request Properties class
 */
export class RequestProperties {
  /**
   * This is the constructor.
   *
   * @param  {Object} properties Request properties
   */
  constructor(properties) {
    this[privateRequestPropertiesSymbol] = new PrivateRequestProperties(properties);
  }

  /**
   * Set the request properties.
   *
   * @param {Object} properties Request properties
   */
  set properties(properties) {
    this.clear().addProperties(properties);
  }

  /**
   * Return the app version request property.
   *
   * @return {String} App version
   */
  get appVersion() {
    return this.getProperty(appVersionKey);
  }

  /**
   * Set the app version request property. The app version can be provided
   * in major.minor.patch format or something specific to your application.
   *
   * @param  {Any} version App version.
   * @return {RequestProperties} The request properties instance.
   */
  set appVersion(version) {
    version = Array.prototype.slice.call(arguments, 1);
    const major = version[0];
    const minor = version[1];
    const patch = version[2];
    let appVersion = '';

    if (major) {
      appVersion = (major + '').trim();
    }

    if (minor) {
      appVersion = ('.' + minor).trim();
    }

    if (patch) {
      appVersion = ('.' + patch).trim();
    }

    this.setProperty(appVersionKey, appVersion);
    return this;
  }

  /**
   * Returns the request property for the key or `undefined` if
   * it has not been set.
   *
   * @param  {String} key Request property key
   * @return {*} Request property value
   */
  getProperty(key) {
    const properties = this.toJSON();

    if (key && properties.hasOwnProperty(key)) {
      return properties[key];
    }

    return undefined;
  }

  /**
   * Sets the request property key to the value.
   *
   * @param {String} key Request property key
   * @param {*} value Request property value
   * @return {RequestProperties} The request properties instance.
   */
  setProperty(key, value) {
    const properties = {};
    properties[key] = value;
    this.addProperties(properties);
    return this;
  }

  /**
   * Adds the properties to the exisiting request properties
   * replacing any that already existed.
   *
   * @param {Object} properties Custom request properties
   * @throws {KinveyError} If properties argument is not an object.
   * @return {RequestProperties} The request properties instance.
   */
  addProperties(properties = {}) {
    if (!isPlainObject(properties)) {
      throw new KinveyError('properties argument must be an object');
    }

    const privateProperties = this[privateRequestPropertiesSymbol];
    privateProperties.addProperties(properties);
    return this;
  }

  /**
   * Clears all the request properties.
   *
   * @return {RequestProperties} The request properties instance.
   */
  clear() {
    const privateProperties = this[privateRequestPropertiesSymbol];
    privateProperties.clear();
    return this;
  }

  /**
   * Clears the request property.
   *
   * @param  {String} key Request property key
   * @return {RequestProperties} The request properties instance.
   */
  clearProperty(key) {
    const privateProperties = this[privateRequestPropertiesSymbol];
    privateProperties.clearProperty(key);
    return this;
  }

  /**
   * Clears the app version property.
   *
   * @return {RequestProperties} The request properties instance.
   */
  clearAppVersion() {
    return this.clearProperty(appVersionKey);
  }

  /**
   * Returns a JSON representation of the request properties.
   *
   * @return {Object} Request properties JSON.
   */
  toJSON() {
    const privateProperties = this[privateRequestPropertiesSymbol];
    return privateProperties.toJSON();
  }
}