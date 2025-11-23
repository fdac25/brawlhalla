// Id prefer to do this in python, but the package only exists in js
const sdk = require("@bmg-esports/sdk");
const {URLSearchParams} = require("url");
const fs = require("fs").promises;

// get all tourney events in the api, we need the slugs from these to find matches
// to get all you need to query from years: [], then gamemodes: []
async function getEvents(gameMode, year) {
    const allEvents = [];
    let nextToken = null;

    // API Tool package is broken for this method,
    // You HAVE to use direct query
    do {
        const directSearchParams = new URLSearchParams(
            {
                // need to query ALL GAME MODES AND YEARS WITH FUNC VARS
                gameMode: gameMode,
                maxResults: '50',
                year: year
            }
        )

        if(nextToken) 
        {
            // need to add next token to end of query to go to next page of events
            directSearchParams.append("nextToken", nextToken);
        }

        const eventURL = `https://api.brawltools.com/v1/event?${directSearchParams}`;
        const eventResponse = await fetch(eventURL);
        if(!eventResponse.ok)
        {
            const errorMsg = await eventResponse.text();
            console.log(`Error: ${eventResponse.status} - ${errorMsg}`);
            break;
        }

        // add the event data to the list
        const responseJSON = await eventResponse.json();
        allEvents.push(...responseJSON.tournaments);
        nextToken = responseJSON.nextToken;
    } while (nextToken);

    return allEvents;
}

// this player search takes a longggg time, so async functions are needed to reduce total time
async function getPlayers() {

    // set up map to hold players for easy dupe checking, then set up array with search tokens I found that worked
    const allPlayers = new Map();
    const searchQueries = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j', 'k', 'l', 'm', 'n', 'o', 'p', 'q', 'r', 's', 't', 'u', 'v', 'w', 'x', 'y', 'z', '0', '1', '2', '3', '4', '5', '6', '7', '8', '9'];

    // go through each of the search queries to get results
    for(const query of searchQueries)
    {
        try
        {
            // token for next page loop. will keep going until no next page.
            let nextToken = null;
            do {

                // will break unless we set next token and max results!!!!
                const searchParams = {
                    query: query,
                    maxResults: 25,
                    nextToken: nextToken
                };

                // search and make sure we have what we need (not blank player)
                const sdkPlayerResponse = await sdk.searchPlayers(searchParams);
                if(sdkPlayerResponse && sdkPlayerResponse.searchPlayers) 
                {
                    // sdk has own types and methods
                    sdkPlayerResponse.searchPlayers.forEach(playerData => {

                        // get the sgg player ID, then check if we already have that player to avoid duplicates
                        const sggID = playerData.player.sggPlayerId;
                        if(!allPlayers.has(sggID))
                        {
                            // add it
                            allPlayers.set(sggID,playerData);
                        }
                    });

                    nextToken = sdkPlayerResponse.nextToken;
                }
                else{break;}
            } while (nextToken);
        }
        catch(error) 
        {
            console.log(`Error while getting player: ${error.message}`);
        }

        // uncomment if you start having api refusal errors***********
        // await new Promise(resolve => setTimeout(resolve, 50));
    }
    console.log(`Got ${allPlayers.size} number of unique players.`);
    return allPlayers;
}

// get player matches, ideally were finding matches for players as were searching for them, speeding things up.
// need event slugs and player ids to find matches
async function getPlayerMatches(players, events)
{
    // set up list for matches, and start searching based off all players and event slugs
    // players is a map so we have to do this weird thing here too
    const allMatches = [];
    let playerCount = 0;
    //const players = (Array.from(playerMap.values()));
    for(const playerObj of (Array.from(players.values())))
    {
        // remove nesting and setup count vars
        const player = playerObj.player;
        playerCount += 1;
        let playerMatchTotal = 0;

        // loop through each event slug for each player to see if they played any matches in it
        for(const event of events)
        {
            // try a direct search based off the player sggID and event slug
            // this is basically the only way to do this on this API
            try
            {
                // direct search off the API here with this search URL setup
                const matchSearchParams = new URLSearchParams();
                matchSearchParams.append('entrantSmashIds', player.sggPlayerId)
                matchSearchParams.append('eventSlug', event.slug);
                const matchSearchURL = `https://api.brawltools.com/v1/player/match?${matchSearchParams}`;
                const matchSearchResponse = await fetch(matchSearchURL)

                if(!matchSearchResponse.ok) {
                    // we're basically brute forcing real combos of players at the events they played at, so well get a TON of misses.
                    // dont print or do anything here unless you need to know something.
                    continue;
                }
                else
                {
                    // put it in json, then set up our new match(es) to add based off the output
                    const outputJSON = await matchSearchResponse.json();
                    if(outputJSON && outputJSON.playerMatches && outputJSON.playerMatches.length>0)
                    {
                        outputJSON.playerMatches.forEach(match => {
                            match.eventInfo = 
                            {
                                slug: event.slug,
                                tournamentName: event.tournamentName,
                                eventName: event.eventName,
                                startTime: event.startTime,
                                year: event.year,
                                isOfficial: event.isOfficial
                            };
                            match.playerInfo = 
                            {
                                smashId: player.sggPlayerId,
                                name: player.name,
                                pr1v1: playerObj.pr1v1?.powerRanking,
                                region: playerObj.pr1v1?.region
                            };
                        });

                    // add the new matches now
                    allMatches.push(...outputJSON.playerMatches);
                    playerMatchTotal += outputJSON.playerMatches.length;
                    }
                }
            }
            catch(error)
            {
                // same as above, due to the nature of how we have to do this, a lot of mismatches.
                // dont print or do anything here unless you need to know something.
            }
        }
        if(playerMatchTotal > 0) {console.log(`Player: ${player.name}, had ${playerMatchTotal} number of matches`);}
        const progress = (playerCount/players.size)*100;
        console.log(`Progress: ${progress}%, and total number of matches: ${allMatches.length}`)
    }
    return allMatches;
}

// get timestamps into a good, readable format
function formatTimestamp(timestamp)
{
    if(!timestamp) return "Unknown";
    const date = new Date(timestamp * 1000);
    return date.toISOString().split('T')[0];
}

// get data into csv rows so we can read it easily in python
function formatMatchesForCSV(matches)
{
    const rows = [];
    for(const match of matches) 
    {
        // get the opponent obj from the match, and get the match legends array so we can join them.
        // also get score so we can decide winner
        const opponent = (match.opponent?.[0] || {});
        const player1Legends = match.legends?.[0] || [];
        const player2Legends = match.legends?.[1] || [];
        const player1Score = match.scores?.[0] || 0;
        const player2Score = match.scores?.[1] || 0;
      
        // decide the winner. draw if no one had greater score than the other
        let winner = "Draw";
        if(player1Score > player2Score){winner = "Player 1";}
        else if(player2Score > player1Score){winner = "Player 2";} 
      
        // construct the rows with content, and push them
        rows.push(
        {
            match_id: match.matchId || "Unknown",
            date: formatTimestamp(match.eventInfo?.startTime),
            year: match.eventInfo?.year || "Unknown",
            tournament_name: match.eventInfo?.tournamentName || "Unknown",
            event_name: match.eventInfo?.eventName || "Unknown",
            is_official: match.eventInfo?.isOfficial ? "Yes" : "No",
            player1_name: match.playerInfo?.name || "Unknown",
            player1_smash_id: match.playerInfo?.smashId || "Unknown",
            player1_region: match.playerInfo?.region || "Unknown",
            player1_pr: match.playerInfo?.pr1v1 || "N/A",
            player1_score: player1Score,
            player1_legends: player1Legends.join(", ") || "Not Reported",
            player2_name: opponent.name || "Unknown",
            player2_smash_id: opponent.smashId || "Unknown",
            player2_score: player2Score,
            player2_legends: player2Legends.join(", ") || "Not Reported",
            winner: winner,
            maps: match.maps?.join(", ") || "Not Reported"
        });
    }

    // prevent crashing
    if(rows.length === 0) {console.log("No data for rows."); return "No data";}
    
    // now we take these rows and make them work for CSV
    const headers = Object.keys(rows[0]);
    const csvHeader = headers.join(",");
    const csvRows = rows.map(row => {
        return headers.map(header => {
            const value = String(row[header]);
            if(value.includes(",") || value.includes("\n") || value.includes('"')) 
            {
                return `"${value.replace(/"/g, '""')}"`;
            }
            return value;
        }).join(",");
    });
    return [csvHeader, ...csvRows].join("\n");
}

async function main() 
{
    try
    {
        console.log("*--Getting Events now--*");

        // setup list of years and gamemodes
        const years = ['2020', '2021', '2022', '2023', '2024', '2025'];
        const gameModes = ['1', '2'];
        let allEvents = [];
        
        // query events for all year and format combinations
        for(const year of years) {
            for(const gameMode of gameModes) {
                const events = await getEvents(gameMode, year);
                allEvents.push(...events);
                
                // uncomment if you start having api refusal errors***********
                // await new Promise(resolve => setTimeout(resolve, 50));
            }
        }

        // check number of events to make sure API is working
        console.log(`Total events acquired: ${allEvents.length}`);
        if(allEvents.length === 0) {console.log("No events found."); return;}

        // get players now
        console.log("*--Getting players now--*");
        const players = await getPlayers();
        if(players.size === 0) {console.log("No players found."); return;}

        // get matches now
        console.log("*--Getting matches now--*");
        const matches = await getPlayerMatches(players, allEvents);
        if(matches.length === 0) {console.log("No matches found."); return;}

        // convert matches to rows then csv, then save into "brawlhalla_tournament_match_data.csv"
        console.log("*--Saving matches into brawlhalla_tournament_match_data.csv now--*");
        const CSVcontent = formatMatchesForCSV(matches);
        await fs.writeFile("brawlhalla_tournament_match_data.csv", CSVcontent, 'utf8');
        console.log(`Final number of...\n - Players: ${players.size}\n - Events: ${allEvents.length}\n - Matches: ${matches.length}`)
    }
    catch(error)
    {
        console.error("Error in main():",error);
        console.error(error.stack);
    }
}

main();
  