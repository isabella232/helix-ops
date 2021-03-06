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

/* eslint-disable no-console, camelcase */

const yargs = require('yargs');
const fs = require('fs');
const { updateOrCreateMonitor } = require('./synthetics.js');
const { updateOrCreatePolicies, reuseOrCreateChannel } = require('./alerts.js');

class CLI {
  // eslint-disable-next-line class-methods-use-this
  run(arg) {
    const config = {};
    let packageJSON = {};

    // load config
    try {
      packageJSON = JSON.parse(fs.readFileSync('package.json'));
      config.packageName = packageJSON.name;
    } catch (e) {
      // ignore
    }

    function baseargs(y) {
      return y
        .positional('url', {
          type: 'string',
          describe: 'The URL to check',
          required: true,
        })
        .positional('email', {
          type: 'string',
          describe: 'The email address to send alerts to',
          required: false,
        })
        .option('auth', {
          type: 'string',
          describe: 'Admin API Key (or env var $NEWRELIC_AUTH)',
          required: true,
        })
        .option('name', {
          type: 'string',
          describe: 'The name of the monitor, channel and policy',
          required: config.packageName === undefined,
          default: config.packageName,
        })
        .option('group_policy', {
          type: 'string',
          describe: 'The name of a common policy to add the monitor to',
          required: false,
        })
        .option('incubator', {
          type: 'boolean',
          describe: 'Flag as incubator setup',
          required: false,
        })
        .option('locations', {
          type: 'string',
          describe: 'The comma-separated list of locations to use',
          required: false,
        })
        .option('frequency', {
          type: 'number',
          describe: 'The frequency to trigger the monitor in minutes',
          required: false,
        })
        .option('type', {
          type: 'string',
          describe: 'The type of monitor (api or browser)',
          required: false,
        })
        .implies('type', 'script') // if type is set, a script must be provided
        .option('script', {
          type: 'string',
          describe: 'The path to a custom monitor script',
          required: false,
        });
    }

    return yargs
      .scriptName('newrelic')
      .usage('$0 <cmd>')
      .command('setup url [email]', 'Create or update a New Relic setup', (y) => baseargs(y), async ({
        auth, name, url, email, group_policy, incubator, script, type, locations, frequency,
      }) => {
        await updateOrCreatePolicies(auth, name, group_policy,
          await updateOrCreateMonitor(auth, name, url, script, type, locations, frequency),
          email ? await reuseOrCreateChannel(auth, name, email, incubator) : null,
          incubator);
        console.log('done.');
      })
      .help()
      .strict()
      .demandCommand(1)
      .env('NEWRELIC')
      .parse(arg)
      .argv;
  }
}

module.exports = CLI;
