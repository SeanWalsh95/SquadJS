import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

import axios from 'axios';
import Logger from 'core/logger';

const __dirname = fileURLToPath(import.meta.url);

export default async function fetchBanLists(banLists) {
  Logger.verbose('SquadServer', 2, `Fetching Ban Lists...`);

  let bans = {};

  for (const list of banLists) {
    let data = '';
    try {
      switch (list.type) {
        case 'remote': {
          const resp = await axios({
            method: 'GET',
            url: `${list.source}`
          });
          data = resp.data;
          break;
        }
        case 'local': {
          const listPath = path.resolve(__dirname, '../../../', list.source);
          if (!fs.existsSync(listPath)) throw new Error(`Could not find Ban List at ${listPath}`);
          data = fs.readFileSync(listPath, 'utf8');
          break;
        }
        default:
          throw new Error(`Unsupported BanList type:${list.type}`);
      }
    } catch (error) {
      Logger.verbose(
        'SquadServer',
        1,
        `Error fetching ${list.type} ban list: ${list.source}`,
        error
      );
    }

    const banRgx = /(?<steamID>^765\d{14}):(?<expires>\S+)/gm;

    for (const m of data.matchAll(banRgx)) {
      try {

        const ban = {}

        ban.steamID = m.groups.steamID;
        ban.expires = m.groups.expires === "0" ? null : new Date( m.groups.expires * 1000 )
        ban.reason = list.defaultReason // use defalt value if no matching reason

        if(ban.steamID in bans)
          bans[ban.steamID].push(ban)
        else
          bans[ban.steamID] = [ban]

        const perms = {};
        for (const groupPerm of group) perms[groupPerm] = true;

      } catch (error) {
        Logger.verbose(
          'SquadServer',
          1,
          `Error parsing ban ${m[0]} from ban list: ${list.source}`,
          error
        );
      }
    }
  }
  Logger.verbose('SquadServer', 1, `${Object.keys(bans).length} bans loaded...`);
  return admins;
}
