import AutoKickUnassigned from './auto-kick-unassigned.js';
import AutoTKWarn from './auto-tk-warn.js';
import ChatCommands from './chat-commands.js';
import DBLog from './db-log.js';
import DiscordAdminBroadcast from './discord-admin-broadcast.js';
import DiscordAdminCamLogs from './discord-admin-cam-logs.js';
import DiscordAdminRequest from './discord-admin-request.js';
import DiscordAwnAutoWhitelist from './discord-awn-auto-whitelist.js';
import DiscordChat from './discord-chat.js';
import DiscordDebug from './discord-debug.js';
import DiscordRcon from './discord-rcon.js';
import DiscordRoundWinner from './discord-round-winner.js';
import DiscordSeedingRewards from './discord-seeding-rewards.js';
import DiscordServerStatus from './discord-server-status.js';
import DiscordSteamLink from './discord-steam-link.js';
import DiscordSubsystemRestarter from './discord-subsystem-restarter.js';
import DiscordTeamkill from './discord-teamkill.js';
import IntervalledBroadcasts from './intervalled-broadcasts.js';
import SCBLInfo from './scbl-info.js';
import SeedingMode from './seeding-mode.js';
import TeamRandomizer from './team-randomizer.js';
import TrackSeedingPlayer from './track-seeding-player.js';

const plugins = [
  AutoKickUnassigned,
  AutoTKWarn,
  ChatCommands,
  DBLog,
  DiscordAdminBroadcast,
  DiscordAdminCamLogs,
  DiscordAdminRequest,
  DiscordAwnAutoWhitelist,
  DiscordChat,
  DiscordDebug,
  DiscordRcon,
  DiscordRoundWinner,
  DiscordSeedingRewards,
  DiscordServerStatus,
  DiscordSteamLink,
  DiscordSubsystemRestarter,
  DiscordTeamkill,
  IntervalledBroadcasts,
  SCBLInfo,
  SeedingMode,
  TeamRandomizer,
  TrackSeedingPlayer
];

const pluginsByName = {};
for (const plugin of plugins) {
  pluginsByName[plugin.name] = plugin;
}

export default pluginsByName;
