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

const yargs = require('yargs');
const fs = require('fs');
const request = require('request-promise-native');

class CLI {
  constructor(arg) {
    let logger = console;
    const config = {};

    try {
      const packageJSON = JSON.parse(fs.readFileSync('package.json'));
      config.name = packageJSON.name;
      config.description = packageJSON.description;
    } catch (e) {
      // ignore
    }

    async function setLogger(silent) {
      function log(...args) {
        if (args.length < 2) {
          return;
        }
        if (args[0] === 'Automation email:' && args[1].indexOf('@') > 0) {
          // only log email in 2nd argument
          // eslint-disable-next-line no-console
          console.log(args[1]);
        }
      }
      function ignore() { }
      if (silent) {
        logger = {
          log,
          debug: ignore,
          warn: ignore,
          error: ignore,
          trace: ignore,
          info: ignore,
        };
      } else {
        logger = console;
      }
    }

    async function getComponents(auth, pageid, group, name) {
      try {
        const loadedcomponents = await request.get(`https://api.statuspage.io/v1/pages/${pageid}/components`, {
          headers: {
            Authorization: auth,
          },
          json: true,
        });

        const result = {};
        [result.component] = loadedcomponents.filter((comp) => comp.name === name);

        if (group) {
          // look for the group component
          [result.compGroup] = loadedcomponents.filter((comp) => comp.group && comp.name === group);
        }
        return result;
      } catch (e) {
        logger.error('Unable to retrieve components:', e.message);
        return {};
      }
    }

    async function createComponent(auth, pageid, name, description, group) {
      // create component
      const component = {
        name,
        description,
        status: 'operational',
        only_show_if_degraded: false,
        showcase: true,
      };
      let msg = `Creating component ${name}`;
      if (group) {
        msg += ` in group ${group.name}`;
        component.group_id = group.id;
      }
      logger.log(msg);
      try {
        return await request.post(`https://api.statuspage.io/v1/pages/${pageid}/components`, {
          json: true,
          headers: {
            Authorization: auth,
          },
          body: {
            component,
          },
        });
      } catch (e) {
        logger.error('Component creation failed:', e.message);
        process.exit(1);
      }
      return null;
    }

    async function updateComponent(auth, pageid, comp, description, group) {
      const component = {};
      if (comp.description !== description) {
        component.description = description;
      }
      if (group && comp.group_id !== group.id) {
        component.group_id = group.id;
      }
      if (Object.keys(component).length > 0) {
        logger.log('Updating component', comp.name);
        try {
          return await request.patch(`https://api.statuspage.io/v1/pages/${pageid}/components/${comp.id}`, {
            json: true,
            headers: {
              Authorization: auth,
            },
            body: {
              component,
            },
          });
        } catch (e) {
          logger.error('Component update failed:', e.message);
        }
      }
      return comp;
    }

    async function updateOrCreateComponent({
      // eslint-disable-next-line camelcase
      auth, page_id, group, name, description, silent,
    }) {
      setLogger(silent);

      let comp;
      const { component, compGroup } = await getComponents(auth, page_id, group, name);
      if (component) {
        logger.log('Reusing existing component', name);
        // update component
        comp = await updateComponent(auth, page_id, component, description, compGroup);
      } else {
        // create component
        comp = await createComponent(auth, page_id, name, description, compGroup);
      }
      if (comp) {
        logger.log('Automation email:', comp.automation_email);
      }
      logger.log('done.');
    }

    function baseargs(y) {
      return y
        .option('auth', {
          type: 'string',
          describe: 'Statuspage API Key (or env $STATUSPAGE_AUTH)',
          required: true,
        })
        .option('page_id', {
          type: 'string',
          alias: 'pageId',
          describe: 'Statuspage Page ID (or env $STATUSPAGE_PAGE_ID)',
          required: true,
        })
        .option('name', {
          type: 'string',
          describe: 'The name of the component',
          required: config.name === undefined,
          default: config.name,
        })
        .option('description', {
          type: 'string',
          describe: 'The description of the component',
          default: config.description,
          required: false,
        })
        .option('group', {
          type: 'string',
          describe: 'The name of an existing component group',
          required: false,
        })
        .option('silent', {
          type: 'boolean',
          describe: 'Reduce output to automation email only',
          required: false,
          default: false,
        });
    }

    return yargs(arg)
      .scriptName('statuspage')
      .usage('$0 <cmd>')
      // eslint-disable-next-line no-underscore-dangle
      .command('setup', 'Create or reuse a Statuspage component', (y) => baseargs(y), updateOrCreateComponent)
      .help()
      .strict()
      .demandCommand(1)
      .env('STATUSPAGE')
      .argv;
  }
}

module.exports = CLI;
