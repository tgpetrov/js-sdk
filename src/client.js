import Promise from './utils/promise';
import { KinveyError, NotFoundError } from './errors';
import { AuthType, HttpMethod } from './enums';
import { LocalRequest, NetworkRequest, DeltaFetchRequest } from './requests/request';
import url from 'url';
import qs from 'qs';
import clone from 'lodash/clone';
import assign from 'lodash/assign';
import isString from 'lodash/isString';
const localNamespace = process.env.KINVEY_LOCAL_NAMESPACE || 'kinvey_local';
const activeUserCollectionName = process.env.KINVEY_ACTIVE_USER_COLLECTION || 'kinvey_activeUser';
const idAttribute = process.env.KINVEY_ID_ATTRIBUTE || '_id';
const kmdAttribute = process.env.KINVEY_KMD_ATTRIBUTE || '_kmd';
const sharedInstanceSymbol = Symbol();

const Auth = {
  /**
   * Authenticate through (1) user credentials, (2) Master Secret, or (3) App
   * Secret.
   *
   * @returns {Promise}
   */
  all(client) {
    return Auth.session(client).catch(() => {
      return Auth.basic(client);
    });
  },

  /**
   * Authenticate through App Secret.
   *
   * @returns {Promise}
   */
  app(client) {
    if (!client.appKey || !client.appSecret) {
      const error = new Error('Missing client credentials');
      return Promise.reject(error);
    }

    return Promise.resolve({
      scheme: 'Basic',
      username: client.appKey,
      password: client.appSecret
    });
  },

  /**
   * Authenticate through (1) Master Secret, or (2) App Secret.
   *
   * @returns {Promise}
   */
  basic(client) {
    return Auth.master(client).catch(() => {
      return Auth.app(client);
    });
  },

  /**
   * Authenticate through Master Secret.
   *
   * @returns {Promise}
   */
  master(client) {
    if (!client.appKey || !client.masterSecret) {
      const error = new Error('Missing client credentials');
      return Promise.reject(error);
    }

    const promise = Promise.resolve({
      scheme: 'Basic',
      username: client.appKey,
      password: client.masterSecret
    });

    return promise;
  },

  /**
   * Do not authenticate.
   *
   * @returns {Promise}
   */
  none() {
    return Promise.resolve(null);
  },

  /**
   * Authenticate through user credentials.
   *
   * @returns {Promise}
   */
  session(client) {
    return client.getActiveUser().then(activeUser => {
      if (!activeUser) {
        throw new Error('There is not an active user.');
      }

      return {
        scheme: 'Kinvey',
        credentials: activeUser[kmdAttribute].authtoken
      };
    });
  }
};

function getAuthFn(type = AuthType.None) {
  switch (type) {
    case AuthType.App:
      return Auth.app;
    case AuthType.Basic:
      return Auth.basic;
    case AuthType.Master:
      return Auth.master;
    case AuthType.None:
      return Auth.none;
    case AuthType.Session:
      return Auth.session;
    default:
      return function(client) {
        return Auth.session(client).catch(err => {
          return Auth.master(client).catch(() => {
            return Promise.reject(err);
          });
        });
      };
  }
}

/**
 * The Client class stores information regarding your application. You can create mutiple clients
 * to send requests to different environments on the Kinvey platform.
 *
 * @example
 * var client = new Kinvey.Client({
 *   appKey: '<appKey>',
 *   appSecret: '<appSecret>'
 * });
 */
export class Client {
  /**
   * Creates a new instance of the Client class. An `options.appKey` must be provided along with
   * either and `options.appSecret` or `options.masterSecret`.
   *
   * @param {Object}    options                             Options
   * @param {string}    [options.protocol='https']          Protocl used for requests
   * @param {string}    [options.host='baas.kinvey.com']    Host used for requests
   * @param {string}    options.appKey                      App Key
   * @param {string}    [options.appSecret]                 App Secret
   * @param {string}    [options.masterSecret]              App Master Secret
   * @param {string}    [options.encryptionKey]             App Encryption Key
   *
   * @throws {KinveyError}  If an `options.appKey` is not provided.
   * @throws {KinveyError}  If neither an `options.appSecret` or `options.masterSecret` is provided.
   */
  constructor(options = {}) {
    options = assign({
      protocol: process.env.KINVEY_API_PROTOCOL || 'https:',
      host: process.env.KINVEY_API_HOST || 'baas.kinvey.com'
    }, options);

    if (!options.appKey && !options.appId) {
      throw new KinveyError('No App Key was provided. ' +
        'Unable to create a new Client without an App Key.');
    }

    if (!options.appSecret && !options.masterSecret) {
      throw new KinveyError('No App Secret or Master Secret was provided. ' +
        'Unable to create a new Client without an App Key.');
    }

    if (options.hostname && isString(options.hostname)) {
      const hostnameParsed = url.parse(options.hostname);
      options.protocol = hostnameParsed.protocol;
      options.host = hostnameParsed.host;
    }

    /**
     * @type {string}
     */
    this.protocol = options.protocol;

    /**
     * @type {string}
     */
    this.host = options.host;

    /**
     * @type {string}
     */
    this.appKey = options.appKey || options.appId;

    /**
     * @type {string|undefined}
     */
    this.appSecret = options.appSecret;

    /**
     * @type {string|undefined}
     */
    this.masterSecret = options.masterSecret;

    /**
     * @type {string|undefined}
     */
    this.encryptionKey = options.encryptionKey;
  }

  getActiveUser() {
    const promise = Promise.resolve().then(() => {
      return this.executeLocalRequest({
        method: HttpMethod.GET,
        pathname: `/${localNamespace}/${this.appKey}/${activeUserCollectionName}`
      });
    }).then(response => {
      const data = response.data;

      if (data.length === 0) {
        return null;
      }

      return data[0];
    }).catch(err => {
      if (err instanceof NotFoundError) {
        return null;
      }

      throw err;
    });

    return promise;
  }

  setActiveUser(user) {
    const promise = this.getActiveUser().then(activeUser => {
      if (activeUser) {
        return this.executeLocalRequest({
          method: HttpMethod.DELETE,
          pathname: `/${localNamespace}/${this.appKey}/${activeUserCollectionName}/${activeUser[idAttribute]}`
        }).then(() => {
          this.session = null;
        });
      }
    }).then(() => {
      if (user) {
        return this.executeLocalRequest({
          method: HttpMethod.POST,
          pathname: `/${localNamespace}/${this.appKey}/${activeUserCollectionName}`,
          data: user
        });
      }
    }).then(response => {
      return response ? response.data : null;
    });

    return promise;
  }

  executeLocalRequest(options = {}) {
    options = assign({
      method: HttpMethod.GET,
      pathname: '/',
      flags: {
        _: Math.random().toString(36).substr(2)
      }
    }, options);
    options.flags = qs.parse(options.flags);

    const request = new LocalRequest({
      method: options.method,
      headers: options.headers,
      auth: getAuthFn(options.auth),
      url: url.format({
        protocol: this.protocol,
        host: this.host,
        pathname: options.pathname,
        query: options.flags
      }),
      properties: options.properties,
      query: options.query,
      data: options.data,
      timeout: options.timeout
    });
    return request.execute();
  }

  executeNetworkRequest(options = {}) {
    options = assign({
      method: HttpMethod.GET,
      auth: AuthType.None,
      pathname: '/',
      flags: {
        _: Math.random().toString(36).substr(2)
      }
    }, options);
    options.flags = qs.parse(options.flags);

    const request = new NetworkRequest({
      method: options.method,
      headers: options.headers,
      url: url.format({
        protocol: this.protocol,
        host: this.host,
        pathname: options.pathname,
        query: options.flags
      }),
      properties: options.properties,
      query: options.query,
      data: options.data,
      timeout: options.timeout
    });

    const promise = Promise.resolve().then(() => {
      const authFn = getAuthFn(options.authType);
      return authFn(this);
    }).then(authInfo => {
      if (authInfo) {
        let credentials = authInfo.credentials;

        if (authInfo.username) {
          credentials = new Buffer(`${authInfo.username}:${authInfo.password}`).toString('base64');
        }

        request.setHeader('Authorization', `${authInfo.scheme} ${credentials}`);
      }
    }).then(() => {
      return request.execute();
    });

    return promise;
  }

  executeDeltaFetchRequest(options = {}) {
    options = assign({
      method: HttpMethod.GET,
      pathname: '/',
      flags: {
        _: Math.random().toString(36).substr(2)
      }
    }, options);
    options.flags = qs.parse(options.flags);

    const request = new DeltaFetchRequest({
      method: options.method,
      headers: options.headers,
      url: url.format({
        protocol: this.protocol,
        host: this.host,
        pathname: options.pathname,
        query: options.flags
      }),
      properties: options.properties,
      query: options.query,
      data: options.data,
      timeout: options.timeout
    });

    const promise = Promise.resolve().then(() => {
      const authFn = getAuthFn(options.authType);
      return authFn(this);
    }).then(authInfo => {
      if (authInfo) {
        let credentials = authInfo.credentials;

        if (authInfo.username) {
          credentials = new Buffer(`${authInfo.username}:${authInfo.password}`).toString('base64');
        }

        request.setHeader('Authorization', `${authInfo.scheme} ${credentials}`);
      }
    }).then(() => {
      return request.execute();
    });

    return promise;
  }

  /**
   * Returns an object containing all the information for this Client.
   *
   * @return {Object} JSON
   */
  toJSON() {
    const json = {
      protocol: this.protocol,
      host: this.host,
      appKey: this.appKey,
      appSecret: this.appSecret,
      masterSecret: this.masterSecret,
      encryptionKey: this.encryptionKey
    };

    return clone(json, true);
  }

  /**
   * Initializes the library by creating a new instance of the
   * Client class and storing it as a shared instance.
   *
   * @param {Object}    options                             Options
   * @param {string}    [options.protocol='https']          Protocl used for requests
   * @param {string}    [options.host='baas.kinvey.com']    Host used for requests
   * @param {string}    options.appKey                      App Key
   * @param {string}    [options.appSecret]                 App Secret
   * @param {string}    [options.masterSecret]              App Master Secret
   * @param {string}    [options.encryptionKey]             App Encryption Key
   *
   * @throws {KinveyError}  If an `options.appKey` is not provided.
   * @throws {KinveyError}  If neither an `options.appSecret` or `options.masterSecret` is provided.
   *
   * @return {Client}  An instance of Client.
   *
   * @example
   * var client = Kinvey.Client.init({
   *   appKey: '<appKey>',
   *   appSecret: '<appSecret>'
   * });
   */
  static init(options) {
    const client = new Client(options);
    Client[sharedInstanceSymbol] = client;
    return client;
  }

  /**
   * Returns the shared client instance used by the library.
   *
   * @throws {KinveyError} If `Kinvey.init()` has not been called.
   *
   * @return {Client} The shared instance.
   */
  static sharedInstance() {
    const client = Client[sharedInstanceSymbol];

    if (!client) {
      throw new KinveyError('You have not initialized the library. ' +
        'Please call Kinvey.init() to initialize the library.');
    }

    return client;
  }
}