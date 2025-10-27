const sdk = require("@bmg-esports/sdk");

async function FindEvents() {
  try {
    const result = await sdk.listEvents({
      gameMode: 1,
      IsOfficial: false,
      Year: 2025,
      MaxResults: 50
    });
    
    // Extract tournaments array
    return result.tournaments || [];
  } catch (error) {
    console.error("Error fetching events:", error.message);
    return [];
  }
}

async function GetPlayerMatches(players, events){
  const allMatches = [];
  for (const player of players) {
    for (const event of events) {
      try {
        const matches = await sdk.listPlayerMatches({
          PlayerId: player.player.smashId,  // Changed from player.id
          EventId: event.id,
          MaxResults: 20
        });
        allMatches.push(...matches);
        console.log(`Fetched matches for player ${player.player.smashId} in event ${event.id}`);
      }
      catch (error) {
        console.error(`Error fetching matches for player ${player.player.smashId} in event ${event.id}:`, error.message);
      }
    }
  }
  return allMatches;
}

async function GetAllPlayers() {
  const playerIds = [
    10, 1035, 1243, 3434, 3564, 3566, 3648, 3811, 3935, 3957,
    4387, 4792, 4936, 5113, 5672, 5838, 6430, 6571, 6784, 7036,
    7275, 7374, 7378, 7856, 7956, 10024, 10071, 10876, 10993, 11838,
    11870, 11917, 11999, 12206, 12702, 12755, 14456, 14598, 15243, 15327, 15992
  ];
  
  const players = [];
  for (const id of playerIds) {
    try {
      const response = await fetch(`https://api.brawltools.com/v1/player/${id}`);
      if (response.ok) {
        const player = await response.json();
        players.push(player);
        console.log(`Fetched player ${id}`);
      }
    } catch (error) {
      console.error(`Error fetching player ${id}:`, error.message);
    }
  }
  return players;
}

async function GetPlayerMatches(players, events){
    const allMatches = [];
    for (const player of players) {
        for (const event of events) {
            try {
                const matches = await sdk.listPlayerMatches({
                    PlayerId: player.id,
                    EventId: event.id,
                    MaxResults: 20
                });
                allMatches.push(...matches);
                console.log(`Fetched matches for player ${player.id} in event ${event.id}`);
            }
            catch (error) {
                console.error(`Error fetching matches for player ${player.id} in event ${event.id}:`, error.message);
            }
        }
    }
    return allMatches;
}

async function main() {
  const [players, events] = await Promise.all([
    GetAllPlayers(),
    FindEvents()
  ]);
  parseJson = (players) => JSON.parse(JSON.stringify(players));
  parseJson2 = (events) => JSON.parse(JSON.stringify(events));

  
  const matches = await GetPlayerMatches(parseJson, parseJson2);
  console.log(matches);
}

main();