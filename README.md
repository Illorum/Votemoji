# Votemoji

A Discord bot that allows users with the Votemoji User role to vote on adding server emojis.

## Commands

### /votemoji start img_url emoji_name
Requires role: Votemoji User
Allows designated users to start a Votemoji election. The attached image URL must be a PNG, GIF, or JPG.

### /votemoji veto
Requires role: Votemoji Admin
Allows designated users to prematurely terminate an emoji election.

# Hosting

1. Make sure node & npm are installed and up to date
1. Create a discord application and obtain client ID and client secret
1. Clone repository and put client ID & secret in the clientId and token fields in index.js
1. Set the names of the roles for starting Votemoji Elections and Vetoing (consts userRole and votemojiAdmin)
1. Set the duration of the election timer (const electionTimer)
1. Set the minimum amount of users required to vote in an election for the result to ratified (const quorum)
1. `cd Votemoji` and `npm install`
1. `node index.js`

