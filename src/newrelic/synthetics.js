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

const fetchAPI = require('@adobe/helix-fetch');
const fs = require('fs');
const path = require('path');

const { fetch } = process.env.HELIX_FETCH_FORCE_HTTP1
  ? fetchAPI.context({ httpsProtocols: ['http1'] })
  : fetchAPI;

const MONITOR_FREQUENCY = 15;
const MONITOR_STATUS = 'ENABLED';
const MONITOR_THRESHOLD = 7;
const MONITOR_LOCATIONS = [
  'AWS_AP_NORTHEAST_1',
  'AWS_AP_NORTHEAST_2',
  'AWS_AP_SOUTH_1',
  'AWS_AP_SOUTHEAST_1',
  'AWS_AP_SOUTHEAST_2',
  'AWS_CA_CENTRAL_1',
  'AWS_EU_CENTRAL_1',
  'AWS_EU_WEST_1',
  'AWS_EU_WEST_2',
  'AWS_EU_WEST_3',
  'AWS_SA_EAST_1',
  'AWS_US_EAST_1',
  'AWS_US_EAST_2',
  'AWS_US_WEST_1',
  'AWS_US_WEST_2',
];
const MONITOR_TYPE = {
  api: 'SCRIPT_API',
  browser: 'SCRIPT_BROWSER',
};

/* eslint-disable no-console */

function getNS(url) {
  // extracts the I/O Runtime namespace from a URL like:
  // https://adobeioruntime.net/api/v1/web/namespace/package/action@latest/_status_check/healthcheck.json
  const ns = /\/api\/v\d\/web\/([\w]|[\w][\w@ .-]*[\w@.-]+)\//.exec(url);
  return ns ? ns[1].replace(/[@ .-]/g, '_').toUpperCase() : 'DEFAULT';
}

async function getMonitors(auth, monitorname) {
  try {
    let more = true;
    const loadedmonitors = [];
    while (more) {
      /* eslint-disable no-await-in-loop */
      const resp = await fetch(`https://synthetics.newrelic.com/synthetics/api/v3/monitors?limit=100&offset=${loadedmonitors.length}`, {
        headers: {
          'X-Api-Key': auth,
        },
      });
      if (!resp.ok) {
        throw new Error(await resp.text());
      }
      const body = await resp.json();
      if (body.count < 10) {
        more = false;
      }
      loadedmonitors.push(...body.monitors);
      /* eslint-enable no-await-in-loop */
    }

    const monitors = loadedmonitors.map(({ id, name }) => ({ id, name }));
    if (monitorname) {
      return monitors.filter((monitor) => monitor.name === monitorname);
    } else {
      return [];
    }
  } catch (e) {
    console.error('Unable to retrieve monitors:', e.message);
    return [];
  }
}

async function updateMonitor(auth, monitor, url, script, locations, frequency) {
  console.log('Updating locations and frequency for monitor', monitor.name);
  try {
    const resp = await fetch(`https://synthetics.newrelic.com/synthetics/api/v3/monitors/${monitor.id}`, {
      method: 'PATCH',
      headers: {
        'X-Api-Key': auth,
      },
      json: {
        locations,
        frequency,
      },
    });
    const body = await resp.text();
    if (!resp.ok) {
      throw new Error(body);
    }
  } catch (e) {
    console.error('Unable to update locations and frequency for monitor:', e.message);
  }

  console.log('Updating script for monitor', monitor.name);

  const scriptText = Buffer.from(fs
    .readFileSync(script || path.resolve(__dirname, 'monitor_script.js'))
    .toString()
    .replace('$$$URL$$$', url)
    .replace('$$$NS$$$', getNS(url)))
    .toString('base64');
  try {
    const resp = await fetch(`https://synthetics.newrelic.com/synthetics/api/v3/monitors/${monitor.id}/script`, {
      method: 'PUT',
      headers: {
        'X-Api-Key': auth,
      },
      json: {
        scriptText,
      },
    });
    const body = await resp.text();
    if (!resp.ok) {
      throw new Error(body);
    }
  } catch (e) {
    console.error('Unable to update script for monitor:', e.message);
  }
}

async function updateOrCreateMonitor(auth, name, url, script, monType, monLoc, monFreq) {
  const [monitor] = await getMonitors(auth, name);
  const type = monType ? MONITOR_TYPE[monType] : MONITOR_TYPE.api;
  const locations = monLoc ? monLoc.split(',').map((loc) => loc.trim()) : MONITOR_LOCATIONS;
  const frequency = monFreq || MONITOR_FREQUENCY;
  if (monitor) {
    // update
    await updateMonitor(auth, monitor, url, script, locations, frequency);
  } else {
    // create
    console.log('Creating monitor', name);
    try {
      const resp = await fetch('https://synthetics.newrelic.com/synthetics/api/v3/monitors', {
        method: 'POST',
        headers: {
          'X-Api-Key': auth,
        },
        json: {
          name,
          type,
          frequency,
          locations,
          status: MONITOR_STATUS,
          slaThreshold: MONITOR_THRESHOLD,
        },
      });
      const body = await resp.text();
      if (!resp.ok) {
        throw new Error(body);
      }
      return await updateOrCreateMonitor(auth, name, url, script, monType, monLoc, monFreq);
    } catch (e) {
      console.error('Monitor creation failed:', e.message);
      process.exit(1);
    }
  }
  return monitor ? monitor.id : null;
}

module.exports = {
  updateOrCreateMonitor,
  MONITOR_FREQUENCY,
  MONITOR_LOCATIONS,
  MONITOR_STATUS,
  MONITOR_THRESHOLD,
  MONITOR_TYPE,
};
