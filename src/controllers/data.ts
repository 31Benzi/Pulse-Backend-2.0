import type { Context } from "hono";
import fs from "fs";
import path from "path";

export async function getContentPages(c: Context) {
  return c.json({
    _title: "Fortnite Game",
    _activeDate: "2000-01-01T00:00:00.000Z",
    lastModified: new Date().toISOString(),
    _locale: "en-US",
    _suggestedPrefetch: [],
    battleroyalenews: {
      news: {
        motds: [],
        messages: []
      },
      _title: "battleroyalenews",
      _activeDate: "2000-01-01T00:00:00.000Z",
      lastModified: new Date().toISOString(),
      _locale: "en-US"
    },
    battleroyalenewsv2: {
      news: {
        motds: [],
        messages: [],
        platform_motds: [],
        platform_messages: []
      }
    },
    battlepassaboutmessages: {
      news: {
        messages: []
      }
    },
    loginmessage: {
      loginmessage: {
        _title: "LoginMessage",
        message: {
          title: "Welcome to Exlo",
          body: "Enjoy your stay!",
          spotlight: false
        }
      },
      _title: "LoginMessage",
      _activeDate: "2000-01-01T00:00:00.000Z",
      lastModified: new Date().toISOString(),
      _locale: "en-US"
    },
    playlistinformation: {
      frontend_matchmaking_header_style: "None",
      frontend_matchmaking_header_text: "",
      playlist_info: {
        playlists: []
      },
      _title: "playlistinformation",
      _activeDate: "2000-01-01T00:00:00.000Z",
      lastModified: new Date().toISOString(),
      _locale: "en-US"
    },
    athenamessage: {
      overrideablemessage: {
        message: {
          title: "",
          body: ""
        }
      }
    },
    savetheworldnews: {
      news: {
        messages: []
      }
    },
    emergencynotice: {
      news: {
        messages: []
      },
      _title: "emergencynotice",
      _activeDate: "2000-01-01T00:00:00.000Z",
      lastModified: new Date().toISOString(),
      _locale: "en-US"
    },
    emergencynoticev2: {
      emergencynotices: {
        emergencynotices: []
      }
    },
    subgameselectdata: {
      battleRoyale: {
        _title: "Battle Royale",
        image: "",
        color: "#0078F2",
        specialMessage: "",
        description: "100 Player PvP"
      },
      creative: {
        _title: "Creative",
        image: "",
        color: "#EE82EE",
        specialMessage: "",
        description: "Create"
      },
      saveTheWorld: {
        _title: "Save The World",
        image: "",
        color: "#FF6600",
        specialMessage: "",
        description: "Cooperative PvE"
      },
      _title: "subgameselectdata",
      _activeDate: "2000-01-01T00:00:00.000Z",
      lastModified: new Date().toISOString(),
      _locale: "en-US"
    },
    shopCarousel: {
      itemsList: []
    },
    dynamicbackgrounds: {
      backgrounds: {
        backgrounds: [{
          stage: "lobbystage1",
          backgroundimage: "https://i.imgur.com/2RDh3EN.png"
        }],
        _type: "DynamicBackgroundList"
      },
      _title: "dynamicbackgrounds",
      _activeDate: "2000-01-01T00:00:00.000Z",
      lastModified: new Date().toISOString(),
      _locale: "en-US"
    },
    shopSections: {
      sectionList: {
        sections: []
      }
    },
    creativenews: {
      news: {
        motds: [],
        messages: []
      }
    },
    tournamentinformation: {
      tournament_info: {
        tournaments: [
          {
            title_color: "FFFFFF",
            loading_screen_image: "https://static.wikia.nocookie.net/fortnite/images/f/fa/Late_Game_Arena_-_Mode_-_Fortnite.jpg",
            background_text_color: "1B1B1B",
            background_right_color: "DD091A",
            poster_back_image: "https://static.wikia.nocookie.net/fortnite/images/f/fa/Late_Game_Arena_-_Mode_-_Fortnite.jpg",
            _type: "Tournament Display Info",
            pin_earned_text: "",
            tournament_display_id: "epicgames_Arena_S9_Solo",
            highlight_color: "FFFFFF",
            schedule_info: "24/7",
            primary_color: "FFFFFF",
            flavor_description: "Compete in Arena mode",
            poster_front_image: "https://static.wikia.nocookie.net/fortnite/images/f/fa/Late_Game_Arena_-_Mode_-_Fortnite.jpg",
            short_format_title: "Solo Arena Lategame",
            title_line_1: "Solo Arena Lategame",
            shadow_color: "1B1B1B",
            details_description: "Ranked competitive play",
            background_left_color: "F81B2D",
            long_format_title: "Solo Arena Lategame",
            poster_fade_color: "DD091A",
            secondary_color: "1B1B1B",
            playlist_tile_image: "https://static.wikia.nocookie.net/fortnite/images/f/fa/Late_Game_Arena_-_Mode_-_Fortnite.jpg",
            base_color: "FFFFFF"
          },
          {
            title_color: "FFFFFF",
            loading_screen_image: "https://static.wikia.nocookie.net/fortnite/images/f/fa/Late_Game_Arena_-_Mode_-_Fortnite.jpg",
            background_text_color: "1B1B1B",
            background_right_color: "DD091A",
            poster_back_image: "https://static.wikia.nocookie.net/fortnite/images/f/fa/Late_Game_Arena_-_Mode_-_Fortnite.jpg",
            _type: "Tournament Display Info",
            pin_earned_text: "",
            tournament_display_id: "epicgames_Arena_S9_Duos",
            highlight_color: "FFFFFF",
            schedule_info: "24/7",
            primary_color: "FFFFFF",
            flavor_description: "Compete in Arena Duos",
            poster_front_image: "https://static.wikia.nocookie.net/fortnite/images/f/fa/Late_Game_Arena_-_Mode_-_Fortnite.jpg",
            short_format_title: "Duos Arena Lategame",
            title_line_1: "Duos Arena Lategame",
            shadow_color: "1B1B1B",
            details_description: "Ranked competitive play",
            background_left_color: "F81B2D",
            long_format_title: "Duos Arena Lategame",
            poster_fade_color: "DD091A",
            secondary_color: "1B1B1B",
            playlist_tile_image: "https://static.wikia.nocookie.net/fortnite/images/f/fa/Late_Game_Arena_-_Mode_-_Fortnite.jpg",
            base_color: "FFFFFF"
          }
        ],
        _type: "Tournaments Info"
      },
      _title: "tournamentinformation",
      _noIndex: false,
      _activeDate: "2018-11-13T22:32:47.734Z",
      lastModified: new Date().toISOString(),
      _locale: "en-US"
    }
  });
}

export async function getAssetList(c: Context) {
  return c.json({
    FortPlaylistAthena: {}
  });
}

export async function getLightswitch(c: Context) {
  return c.json([{
    serviceInstanceId: "fortnite",
    status: "UP",
    message: "Fortnite is online",
    maintenanceUri: null,
    overrideCatalogIds: ["a7f138b2e51945ffbfdacc1af0541053"],
    allowedActions: ["PLAY", "DOWNLOAD"],
    banned: false,
    launcherInfoDTO: {
      appName: "Fortnite",
      catalogItemId: "4fe75bbc5a674f4f9b356b5c90567da5",
      namespace: "fn"
    }
  }]);
}

export async function getLightswitchBulk(c: Context) {
  return c.json([{
    serviceInstanceId: "fortnite",
    status: "UP",
    message: "Fortnite is online",
    maintenanceUri: null,
    overrideCatalogIds: ["a7f138b2e51945ffbfdacc1af0541053"],
    allowedActions: ["PLAY", "DOWNLOAD"],
    banned: false,
    launcherInfoDTO: {
      appName: "Fortnite",
      catalogItemId: "4fe75bbc5a674f4f9b356b5c90567da5",
      namespace: "fn"
    }
  }]);
}

export async function getEnabledFeatures(c: Context) {
  return c.json([]);
}

export async function getReceipts(c: Context) {
  return c.json([]);
}

export async function getEntitlements(c: Context) {
  return c.json([]);
}

export async function getBlocklist(c: Context) {
  return c.json({ blockedUsers: [] });
}

export async function getSupportedCodes(c: Context) {
  return c.json([
    { codeType: "SupportACreator", codeLength: 6 }
  ]);
}

export async function getCreatorCode(c: Context) {
  return c.json({
    codeId: "exlo",
    codeStatus: "ACTIVE",
    codeType: "SupportACreator",
    dateCreated: "2000-01-01T00:00:00.000Z",
    dateModified: "2000-01-01T00:00:00.000Z",
    ownerType: "ACCOUNT",
    payoutInfo: {},
    slugDisplayName: "Exlo",
    status: "ACTIVE",
    verified: true
  });
}

export async function setCreatorCode(c: Context) {
  return c.body(null, 204);
}

export async function grantAccess(c: Context) {
  return c.body(null, 204);
}

export async function getPlatforms(c: Context) {
  return c.json([]);
}

export async function getExternalAuths(c: Context) {
  return c.json([]);
}

export async function getLinks(c: Context) {
  return c.json({});
}

export async function getMnemonic(c: Context) {
  return c.json({
    playlistId: "Playlist_DefaultSolo",
    playlistName: "Solo",
    islandId: "",
    linkCode: "",
    isFavorite: false,
    globalCCU: 0,
    lockingStatus: "UnLocked",
    moderationStatus: "Approved"
  });
}

export async function getDiscovery(c: Context) {
  return c.json({
    panels: [],
    testCohorts: [],
    lastModified: new Date().toISOString()
  });
}

export async function getActivePanels(c: Context) {
  return c.json({
    results: [],
    hasMore: false
  });
}

export async function getDistributionPoints(c: Context) {
  return c.json({
    distributions: [
      "https://epicgames-download1.akamaized.net/",
      "https://download.epicgames.com/",
      "https://download2.epicgames.com/",
      "https://download3.epicgames.com/",
      "https://download4.epicgames.com/",
      "https://fastly-download.epicgames.com/",
    ],
  });
}
