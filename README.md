<div align="center">

<img src="assets/squadjs-logo.png" alt="Logo" width="500"/>

#### SquadJS

[![GitHub release](https://img.shields.io/github/release/Thomas-Smyth/SquadJS.svg?style=flat-square)](https://github.com/Thomas-Smyth/SquadJS/releases)
[![GitHub contributors](https://img.shields.io/github/contributors/Thomas-Smyth/SquadJS.svg?style=flat-square)](https://github.com/Thomas-Smyth/SquadJS/graphs/contributors)
[![GitHub release](https://img.shields.io/github/license/Thomas-Smyth/SquadJS.svg?style=flat-square)](https://github.com/Thomas-Smyth/SquadJS/blob/master/LICENSE)

<br>

[![GitHub issues](https://img.shields.io/github/issues/Thomas-Smyth/SquadJS.svg?style=flat-square)](https://github.com/Thomas-Smyth/SquadJS/issues)
[![GitHub pull requests](https://img.shields.io/github/issues-pr-raw/Thomas-Smyth/SquadJS.svg?style=flat-square)](https://github.com/Thomas-Smyth/SquadJS/pulls)
[![GitHub issues](https://img.shields.io/github/stars/Thomas-Smyth/SquadJS.svg?style=flat-square)](https://github.com/Thomas-Smyth/SquadJS/stargazers)
[![Discord](https://img.shields.io/discord/266210223406972928.svg?style=flat-square&logo=discord)](https://discord.gg/9F2Ng5C)

<br><br>
</div>

## **About**
SquadJS is a scripting framework, designed for Squad servers, that aims to handle all communication and data collection to and from the servers. Using SquadJS as the base to any of your scripting projects allows you to easily write complex plugins without having to worry about the hassle of RCON or log parsing. However, for your convenience SquadJS comes shipped with multiple plugins already built for you allowing you to experience the power of SquadJS right away.

<br>

## **Using SquadJS**
SquadJS relies on being able to access the Squad server log directory in order to parse logs live to collect information. Thus, SquadJS must be hosted on the same server box as your Squad server or be connected to your Squad server via FTP.

#### Prerequisites
 * Git
 * [Node.js](https://nodejs.org/en/) (Current) - [Download](https://nodejs.org/en/)
 * [Yarn](https://yarnpkg.com/) (Version 1.22.0+) - [Download](https://classic.yarnpkg.com/en/docs/install)
 * Some plugins may have additional requirements.
 
#### Installation
1. Clone the repository: `git clone https://github.com/Thomas-Smyth/SquadJS`
2. Install the dependencies: `yarn install`
3. Configure the `config.json` file. See below for more details.
4. Start SquadJS: `node index.js`.

<br>

## **Configuring SquadJS**
SquadJS can be configured via a JSON configuration file which, by default, is located in the SquadJS and is named [config.json](./config.json).

The config file needs to be valid JSON syntax. If an error is thrown saying the config cannot be parsed then try putting the config into a JSON syntax checker (there's plenty to choose from that can be found via Google).

<details>
  <summary>Server</summary>

  ## Server Configuration

  The following section of the configuration contains information about your Squad server.

  ```json
  "server": {
    "id": 1,
    "host": "xxx.xxx.xxx.xxx",
    "queryPort": 27165,
    "rconPort": 21114,
    "rconPassword": "password",
    "logReaderMode": "tail",
    "logDir": "C:/path/to/squad/log/folder",
    "ftp":{
      "port": 21,
      "user": "FTP Username",
      "password": "FTP Password",
      "useListForSize": false
    },
    "adminLists": [
      {
        "type": "local",
        "source": "C:/Users/Administrator/Desktop/Servers/sq_arty_party/SquadGame/ServerConfig/Admins.cfg",
      },
      {
        "type": "remote",
        "source": "http://yourWebsite.com/Server1/Admins.cfg",
      }
    ]
  },
  ```
  * `id` - An integer ID to uniquely identify the server.
  * `host` - The IP of the server.
  * `queryPort` - The query port of the server.
  * `rconPort` - The RCON port of the server.
  * `rconPassword` - The RCON password of the server.
  * `logReaderMode` - `tail` will read from a local log file. `ftp` will read from a remote log file using the FTP protocol.
  * `logDir` - The folder where your Squad logs are saved. Most likely will be `C:/servers/squad_server/SquadGame/Saved/Logs`.
  * `ftp:port` - The FTP port of the server. Only required for `ftp` `logReaderMode`.
  * `ftp:user` - The FTP user of the server. Only required for `ftp` `logReaderMode`.
  * `ftp:password` - The FTP password of the server. Only required for `ftp` `logReaderMode`.
  * `adminLists` - Sources for identifying an admins on the server, either remote or local.

  ---
</details>


<details>
  <summary>Connectors</summary>
  
  ## Connector Configuration

  Connectors allow SquadJS to communicate with external resources.
  ```json
  "connectors": {
    "discord": "Discord Login Token",
  },
  ```
  Connectors should be named, for example the above is named `discord`, and should have the associated config against it. Configs can be specified by name in plugin options. Should a connector not be needed by any plugin then the default values can be left or you can remove it from your config file.

  See below for more details on connectors and their associated config.

  ##### Squad Layer Filter
  Connects to a filtered list of Squad layers and filters them either by an "initial filter" or an "active filter" that depends on current server information, e.g. player count.
  ```js
  "layerFilter": {
    "type": "buildPoolFromFilter",
    "filter": {
      "whitelistedLayers": null,
      "blacklistedLayers": null,
      "whitelistedMaps": null,
      "blacklistedMaps": null,
      "whitelistedGamemodes": null,
      "blacklistedGamemodes": [
        "Training"
      ],
      "flagCountMin": null,
      "flagCountMax": null,
      "hasCommander": null,
      "hasTanks": null,
      "hasHelicopters": null
    },
    "activeLayerFilter": {
      "historyResetTime": 18000000,
      "layerHistoryTolerance": 8,
      "mapHistoryTolerance": 4,
      "gamemodeHistoryTolerance": {
        "Invasion": 4
      },
      "gamemodeRepetitiveTolerance": {
        "Invasion": 4
      },
      "playerCountComplianceEnabled": true,
      "factionComplianceEnabled": true,
      "factionHistoryTolerance": {
        "RUS": 4
      },
      "factionRepetitiveTolerance": {
        "RUS": 4
      }
    }
  },
  ```
  * `type` - The type of filter builder to use. `filter` will depend on this type.
    - `buildPoolFromFilter` - Builds the Squad layers list from a list of filters. An example `filter` with default values for this type is show above.
      - `whitelistedLayers` - List of layers to consider.
      - `blacklistLayers` -  List of layers to not consider.
      - `whitelistedMaps` - List of maps to consider.
      - `blacklistedMaps` - List of maps to not consider.
      - `whitelistedGamemodes` - List of gamemodes to consider.
      - `blacklistedGamemodes` - List of gamemodes to not consider.
      - `flagCountMin` - Minimum number of flags the layer may have.
      - `flagCountMax` - Maximum number of flags the layer may have.
      - `hasCommander` - Layer must/most not have a commander. `null` for either.
      - `hasTanks` - Layer must/most not have a tanks. `null` for either.
      - `hasHelicopters` - Layer must/most not have a helicopters. `null` for either.
    - `buildPoolFromFile` - Builds the Squad layers list from a Squad layer config file. `filter` should be the filename of the config file.
    - `buildPoolFromLayerNames` - Builds the Squad layers list from a list of layers. `filter` should be a list of layers, e.g. `"filter": ["Sumari AAS v1", "Fool's Road AAS v1"]`.
  * `filter` - Described above.
  * `activeLayerFilter` - Filters layers live as server information updates, e.g. if the player count exceeds a certain amount a layer may no longer be in the filter.
    - `historyResetTime` - After this number of milliseconds the layer history is no longer considered.
    - `layerHistoryTolerance` - A layer can only be played again after this number of layers.
    - `mapHistoryTolerance` - A map can only be played again after this number of layers.
    - `gamemodeHistoryTolerance` - A gamemode can only be played again after this number of layers. Gamemodes can be specified individually inside the object. If they are not listed then the filter is not applied.
    - `gamemodeRepetitiveTolerance` - A gamemode can only be played this number of times in a row. Gamemodes can be specified individually inside the object. If they are not listed then the filter is not applied.  
    - `playerCountComplianceEnabled` - Filter layers by player count.
    - `factionComplianceEnabled` - Filter layers so that a team cannot play the same faction twice in a row.
    - `factionHistoryTolerance` - A faction can only be played again after this number of layers. Factions can be specified individually inside the object. If they are not listed then the filter is not applied.
    - `factionRepetitiveTolerance` - A faction can only be played this number of times in a row. Factions can be specified individually inside the object. If they are not listed then the filter is not applied.  

  ##### Discord
  Connects to Discord via `discord.js`.
  ```json
  "discord": "Discord Login Token",
  ```
  Requires a Discord bot login token.


  ##### Databases
  SquadJS uses [Sequelize](https://sequelize.org/) to connect and use a wide range of SQL databases.

  The connector should be configured using any of Sequelize's single argument configuration options.

  For example:
  ```json
  "mysql": "mysql://user:pass@example.com:5432/dbname"
  ```

  or:
  ```json
  "sqlite": {
      "dialect": "sqlite",
      "storage": "path/to/database.sqlite"
  }
  ```

  See [Sequelize's documentation](https://sequelize.org/master/manual/getting-started.html#connecting-to-a-database) for more details.

  ---
</details>

<details>
  <summary>Plugins</summary>
  
  ## Plugin Configuration

  The `plugins` section in your config file lists all plugins built into SquadJS
  ```json
    "plugins": [
      {
        "plugin": "auto-tk-warn",
        "disabled": false,
        "message": "Please apologise for ALL TKs in ALL chat!"
      }
    ]
  ```

  The `disabled` field can be toggled between `true`/ `false` to enabled/disable the plugin. 

  Plugin options are also specified. A full list of plugin options can be seen below.

  ---
</details>

<details>
  <summary>Verboseness</summary>
  
  ## Console Output Configuration

  The `logger` section configures how verbose a module of SquadJS will be as well as the displayed color.
  ```json
    "logger": {
      "verboseness": {
        "SquadServer": 1,
        "LogParser": 1,
        "RCON": 1
      },
      "colors": {
        "SquadServer": "yellowBright",
        "SquadServerFactory": "yellowBright",
        "LogParser": "blueBright",
        "RCON": "redBright"
      }
    }
  ```
  The larger the number set in the `verboseness` section for a specified module the more it will print to the console.

  ---
</details>

<br>

## **Plugins**
The following is a list of plugins built into SquadJS, you can click their title for more information:

Interested in creating your own plugin? [See more here](./squad-server/plugins/readme.md)

<details>
          <summary>DiscordRoundWinner</summary>
          <h2>DiscordRoundWinner</h2>
          <p>The <code>DiscordRoundWinner</code> plugin will send the round winner to a Discord channel.</p>
          <h3>Options</h3>
          <ul><li><h4>discordClient (Required)</h4>
           <h6>Description</h6>
           <p>Discord connector name.</p>
           <h6>Default</h6>
           <pre><code>discord</code></pre></li>
<li><h4>channelID (Required)</h4>
           <h6>Description</h6>
           <p>The ID of the channel to log admin broadcasts to.</p>
           <h6>Default</h6>
           <pre><code></code></pre></li><h6>Example</h6>
           <pre><code>667741905228136459</code></pre>
<li><h4>color</h4>
           <h6>Description</h6>
           <p>The color of the embed.</p>
           <h6>Default</h6>
           <pre><code>16761867</code></pre></li></ul>
        </details>

<details>
          <summary>DiscordAdminCamLogs</summary>
          <h2>DiscordAdminCamLogs</h2>
          <p>The <code>DiscordAdminCamLogs</code> plugin will log in game admin camera usage to a Discord channel.</p>
          <h3>Options</h3>
          <ul><li><h4>discordClient (Required)</h4>
           <h6>Description</h6>
           <p>Discord connector name.</p>
           <h6>Default</h6>
           <pre><code>discord</code></pre></li>
<li><h4>channelID (Required)</h4>
           <h6>Description</h6>
           <p>The ID of the channel to log admin camera usage to.</p>
           <h6>Default</h6>
           <pre><code></code></pre></li><h6>Example</h6>
           <pre><code>667741905228136459</code></pre>
<li><h4>color</h4>
           <h6>Description</h6>
           <p>The color of the embed.</p>
           <h6>Default</h6>
           <pre><code>16761867</code></pre></li></ul>
        </details>

<details>
          <summary>DiscordDebug</summary>
          <h2>DiscordDebug</h2>
          <p>The <code>DiscordDebug</code> plugin can be used to help debug SquadJS by dumping SquadJS events to a Discord channel.</p>
          <h3>Options</h3>
          <ul><li><h4>discordClient (Required)</h4>
           <h6>Description</h6>
           <p>Discord connector name.</p>
           <h6>Default</h6>
           <pre><code>discord</code></pre></li>
<li><h4>channelID (Required)</h4>
           <h6>Description</h6>
           <p>The ID of the channel to log events to.</p>
           <h6>Default</h6>
           <pre><code></code></pre></li><h6>Example</h6>
           <pre><code>667741905228136459</code></pre>
<li><h4>events (Required)</h4>
           <h6>Description</h6>
           <p>A list of events to dump.</p>
           <h6>Default</h6>
           <pre><code>[]</code></pre></li><h6>Example</h6>
           <pre><code>[
  "PLAYER_DIED"
]</code></pre></ul>
        </details>

<details>
          <summary>DiscordChat</summary>
          <h2>DiscordChat</h2>
          <p>The <code>DiscordChat</code> plugin will log in-game chat to a Discord channel.</p>
          <h3>Options</h3>
          <ul><li><h4>discordClient (Required)</h4>
           <h6>Description</h6>
           <p>Discord connector name.</p>
           <h6>Default</h6>
           <pre><code>discord</code></pre></li>
<li><h4>channelID (Required)</h4>
           <h6>Description</h6>
           <p>The ID of the channel to log admin broadcasts to.</p>
           <h6>Default</h6>
           <pre><code></code></pre></li><h6>Example</h6>
           <pre><code>667741905228136459</code></pre>
<li><h4>chatColors</h4>
           <h6>Description</h6>
           <p>The color of the embed for each chat.</p>
           <h6>Default</h6>
           <pre><code>{}</code></pre></li><h6>Example</h6>
           <pre><code>{
  "ChatAll": 16761867
}</code></pre>
<li><h4>color</h4>
           <h6>Description</h6>
           <p>The color of the embed.</p>
           <h6>Default</h6>
           <pre><code>16761867</code></pre></li>
<li><h4>ignoreChats</h4>
           <h6>Description</h6>
           <p>A list of chat names to ignore.</p>
           <h6>Default</h6>
           <pre><code>[
  "ChatSquad"
]</code></pre></li></ul>
        </details>

<details>
          <summary>IntervalledBroadcasts</summary>
          <h2>IntervalledBroadcasts</h2>
          <p>The <code>IntervalledBroadcasts</code> plugin allows you to set broadcasts, which will be broadcasted at preset intervals</p>
          <h3>Options</h3>
          <ul><li><h4>broadcasts</h4>
           <h6>Description</h6>
           <p>Messages to broadcast.</p>
           <h6>Default</h6>
           <pre><code>[]</code></pre></li><h6>Example</h6>
           <pre><code>[
  "This server is powered by SquadJS."
]</code></pre>
<li><h4>interval</h4>
           <h6>Description</h6>
           <p>Frequency of the broadcasts in milliseconds.</p>
           <h6>Default</h6>
           <pre><code>300000</code></pre></li></ul>
        </details>

<details>
          <summary>DiscordServerStatus</summary>
          <h2>DiscordServerStatus</h2>
          <p>The <code>DiscordServerStatus</code> plugin updates a message in Discord with current server information, e.g. player count.</p>
          <h3>Options</h3>
          <ul><li><h4>discordClient (Required)</h4>
           <h6>Description</h6>
           <p>Discord connector name.</p>
           <h6>Default</h6>
           <pre><code>discord</code></pre></li>
<li><h4>messageIDs (Required)</h4>
           <h6>Description</h6>
           <p>ID of messages to update.</p>
           <h6>Default</h6>
           <pre><code>[]</code></pre></li><h6>Example</h6>
           <pre><code>[
  {
    "channelID": "667741905228136459",
    "messageID": "766688383043895387"
  }
]</code></pre>
<li><h4>updateInterval</h4>
           <h6>Description</h6>
           <p>How frequently to update the status in Discord.</p>
           <h6>Default</h6>
           <pre><code>60000</code></pre></li>
<li><h4>disableStatus</h4>
           <h6>Description</h6>
           <p>Disable the bot status.</p>
           <h6>Default</h6>
           <pre><code>false</code></pre></li></ul>
        </details>

<details>
          <summary>DiscordAdminRequest</summary>
          <h2>DiscordAdminRequest</h2>
          <p>The <code>DiscordAdminRequest</code> plugin will ping admins in a Discord channel when a player requests an admin via the <code>!admin</code> command in in-game chat.</p>
          <h3>Options</h3>
          <ul><li><h4>discordClient (Required)</h4>
           <h6>Description</h6>
           <p>Discord connector name.</p>
           <h6>Default</h6>
           <pre><code>discord</code></pre></li>
<li><h4>channelID (Required)</h4>
           <h6>Description</h6>
           <p>The ID of the channel to log admin broadcasts to.</p>
           <h6>Default</h6>
           <pre><code></code></pre></li><h6>Example</h6>
           <pre><code>667741905228136459</code></pre>
<li><h4>ignoreChats</h4>
           <h6>Description</h6>
           <p>A list of chat names to ignore.</p>
           <h6>Default</h6>
           <pre><code>[]</code></pre></li><h6>Example</h6>
           <pre><code>[
  "ChatSquad"
]</code></pre>
<li><h4>ignorePhrases</h4>
           <h6>Description</h6>
           <p>A list of phrases to ignore.</p>
           <h6>Default</h6>
           <pre><code>[]</code></pre></li><h6>Example</h6>
           <pre><code>[
  "switch"
]</code></pre>
<li><h4>command</h4>
           <h6>Description</h6>
           <p>The command that calls an admin.</p>
           <h6>Default</h6>
           <pre><code>admin</code></pre></li>
<li><h4>pingGroups</h4>
           <h6>Description</h6>
           <p>A list of Discord role IDs to ping.</p>
           <h6>Default</h6>
           <pre><code>[]</code></pre></li><h6>Example</h6>
           <pre><code>[
  "500455137626554379"
]</code></pre>
<li><h4>pingDelay</h4>
           <h6>Description</h6>
           <p>Cooldown for pings in milliseconds.</p>
           <h6>Default</h6>
           <pre><code>60000</code></pre></li>
<li><h4>color</h4>
           <h6>Description</h6>
           <p>The color of the embed.</p>
           <h6>Default</h6>
           <pre><code>16761867</code></pre></li></ul>
        </details>

<details>
