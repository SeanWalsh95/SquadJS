import axios from 'axios';
import Logger from 'core/logger';

/**
 * Scrape Steamcommunity profile for meta info
 *
 * @param {String} steamURL - URL to community profile
 * @returns {Object|null} {steamID, name, summary} or null if the scrape failed
 * */
export default async function scrapeSteamProfile(steamURL) {
  const urlMatch = steamURL.match(
    /(?:https?:\/\/)?(?<urlPart>steamcommunity.com\/(?:id|profiles)\/.*?)(?=[\s\b]|$)/
  );
  if (!urlMatch) return;

  try {
    const res = await axios({
      method: 'get',
      url: `https://${urlMatch.groups.urlPart}`
    });

    /**
     * @typedef {Object} SteamData
     * @property {String} url - the URL of the proifle
     * @property {String} steamid - Steam64ID
     * @property {String} personaname - current steam display name
     * @property {String} summary - summary from steam profile
     */
    const steamData = JSON.parse(res.data.match(/(?<=g_rgProfileData\s*=\s*)\{.*\}/));
    Logger.verbose('SteamScraper', 1, `Scraped Steam Profile: ${steamData.url}`);

    return {
      steamID: steamData.steamid,
      name: steamData.personaname,
      summary: steamData.summary
    };
  } catch (error) {
    Logger.verbose('SteamScraper', 1, `ERROR Scraping Steam Profile: ${steamURL}\n${error}`);
  }
}
