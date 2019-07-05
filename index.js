/*
 * Copyright 2019 Adobe. All rights reserved.
 * This file is licensed to you under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License. You may obtain a copy
 * of the License at http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software distributed under
 * the License is distributed on an "AS IS" BASIS, WITHOUT WARRANTIES OR REPRESENTATIONS
 * OF ANY KIND, either express or implied. See the License for the specific language
 * governing permissions and limitations under the License.
 */

/* eslint-disable no-underscore-dangle */
const request = require('request-promise-native');
const fs = require('fs');

let _version;

async function getVersion() {
  if (!_version) {
    _version = await new Promise((resolve) => {
      fs.readFile('package.json', 'utf-8', (err, data) => {
        if (err) {
          // eslint-disable-next-line no-console
          console.error('error while reading package.json:', err);
          resolve('n/a');
        } else {
          try {
            resolve(JSON.parse(data).version || 'n/a');
          } catch (e) {
            // eslint-disable-next-line no-console
            console.error('error while parsing package.json:', e);
            resolve('n/a');
          }
        }
      });
    });
  }
  return _version;
}

async function report(checks = {}) {
  const start = Date.now();
  const version = await getVersion();

  try {
    const runchecks = Object.keys(checks)
      .filter(key => key.match('^[a-z0-9]+$'))
      .map(key => [key, checks[key]])
      .map(([key, url]) => request.get(url, { resolveWithFullResponse: true, time: true })
        .then(response => ({ key, response })));

    const checkresults = await Promise.all(runchecks);

    let body = `<pingdom_http_custom_check>
  <status>OK</status>
  <version>${version}</version>
  <response_time>${Math.abs(Date.now() - start)}</response_time>
`;

    body += checkresults
      .map(({ key, response }) => `  <${key}>${Math.floor(response.timings.end)}</${key}>`)
      .join('\n');

    body += `
</pingdom_http_custom_check>`;

    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/xml',
      },
      body,
    };
  } catch (e) {
    return {
      statusCode: 503,
      headers: {
        'Content-Type': 'application/xml',
      },
      body: `<pingdom_http_custom_check>
  <status>failed</status>
  <version>${version}</version>
  <response_time>${Math.abs(Date.now() - start)}</response_time>
  <error>
    <url>${e.options.uri}</url>
    <statuscode>${e.response.statusCode}</statuscode>
    <body><![CDATA[
${e.response.body}
    ]]></body>
  </error>
  <process>
    <activation>${process.env.__OW_ACTIVATION_ID}</activation>
  </process>
</pingdom_http_custom_check>`,
    };
  }
}

function wrap(func, checks) {
  return (params) => {
    if (params
      // eslint-disable-next-line no-underscore-dangle
      && params.__ow_method === 'get'
      // eslint-disable-next-line no-underscore-dangle
      && !params.__ow_path
      && Object.keys(params)
        .filter(key => !(key.match(/^__/) || key.match(/^[A-Z0-9_]+$/))).length === 0) {
      return report(checks);
    }
    return func(params);
  };
}

/**
 * This is the main function
 * @param {object|function} paramsorfunction a params object (if called as an OpenWhisk action)
 * or a function to wrap.
 * @param {object} checks a map of checks to perfom. Each key is a name of the check,
 * each value a URL to ping
 * @returns {object|function} a status report for Pingdom or a wrapped function
 */
function main(paramsorfunction, checks = {}) {
  if (typeof paramsorfunction === 'function') {
    return wrap(paramsorfunction, checks);
  } else if (typeof paramsorfunction === 'object') {
    return report(paramsorfunction);
  }
  throw new Error('Invalid Arguments: expected function or object');
}

module.exports = { main, wrap };
