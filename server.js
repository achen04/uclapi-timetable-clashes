// server.js
// where your node app starts

// init project
var express = require('express');
var app = express();
var randomstring = require("randomstring");
const util = require('util');
var moment = require('moment');
const nodeRequest = require('request');
var rp = require('request-promise');

const client_id = process.env.OAUTH_CLIENT_ID
const client_secret = process.env.OAUTH_CLIENT_SECRET

var states = { };
var token = "";
var users = [];

// http://expressjs.com/en/starter/static-files.html
app.use(express.static('public'));

// http://expressjs.com/en/starter/basic-routing.html
app.get("/", function (request, response) {
  response.sendFile(__dirname + '/views/index.html');
});

app.get("/oauth/authorise", function(request, response) {
  var state = randomstring.generate();
  states[state] = moment();
  var url = util.format('https://uclapi.com/oauth/authorise?client_id=%s&state=%s', client_id, state);
  response.redirect(url);
});

app.get("/oauth/complete", (request, response) => response.sendFile(__dirname + '/views/oauth/complete.html'));

app.get("/oauth/callback", function(request, response) {
  var timeNow = moment();
  if (request.query.state in states) {
    if (moment(states[request.query.state]).add(300, 'seconds') > timeNow) {
      if (request.query.result == "denied") {
        var deniedText = util.format('The login operation for state %s was denied', request.query.state);
        response.send(deniedText);
      } else {
        // Successful login
        var tokenUrl = util.format('https://uclapi.com/oauth/token?client_id=%s&client_secret=%s&code=%s', client_id, client_secret, request.query.code);
        var name = "";
        nodeRequest(tokenUrl, { json: true }, (err, res, body) => {
          if (err) { return console.log(err); }
          token = body.token;
          var userDataUrl = util.format('https://uclapi.com/oauth/user/data?client_secret=%s&token=%s', client_secret, token);
          nodeRequest(userDataUrl, {json: true}, (err, res, body) => {
            if (err) { return console.log(err); }
            name = body.full_name;
            var protectionKey = randomstring.generate();
            var user = {
              "name": body.full_name,
              "department": body.department,
              "token": token,
              "auth_key": protectionKey
            }
            users.push(user);
            var userId = users.length - 1;
            
            var redirectUrl = util.format('/oauth/complete?id=%s&key=%s', userId, protectionKey);

            response.redirect(redirectUrl);
          });        
        });
      }
    } else {
      response.send("Authorisation took more than 5 minutes, so it has failed");
    }
  } else {
    response.send("state does not exist");
  }
});


app.get("/submission", function(request, response) { 
  // Parse the URL to get each course name
  var urlParts = require('url').parse(request.url, true);
  var courses = "";
  var data = {};
  var clashes = [];
  // Note: possibly help users make this non-case sensitive (make capital letters)
  if (urlParts.query.course1 != "") {
    courses += urlParts.query.course1;
  }
  if (urlParts.query.course2 != "") {
    courses += "," + urlParts.query.course2;
  }
  if (urlParts.query.course3 != "") {
    courses += "," + urlParts.query.course3;
  }
  if (urlParts.query.course4 != "") {
    courses += "," + urlParts.query.course4;
  }

  // Make API request with valid course names
  var timetableUrl = util.format('https://uclapi.com/timetable/bymodule?token=%s&client_secret=%s&modules=%s', token, client_secret, courses);

  var options = {
    method: 'GET',
    uri: timetableUrl,
    json: true
  };

  rp(options)
    .then(function (parsedBody) {
      data = parsedBody;
      console.log(JSON.stringify(data));
    
      if (data['ok'] == true) { // Check if data has been correctly returned
      //  clashes = {"ok": true, };
        // Loop through all the dates in the timetable to check for clashes
        var numOfDates = (Object.keys(data['timetable']).length);
        for (var i = 0; i < numOfDates; i++) {
          // if one date = array > 1, and course ID is different and the times conflict = clash
          var day = Object.values(data['timetable'])[i];
          if (day.length > 1) { // Multiple courses that day, but may be the same course or may be at diff time
           // console.log("multiple courses on this day " + JSON.stringify(day[0]["module"]["module_code"]));
            for (var j = 0; j < day.length; j++) {
              for (var k = j + 1; k < day.length; k++) { // Compare each object with the other objs
                console.log(day[j]["module"]["module_id"] + " at " + j + " compared to " + day[k]["module"]["module_id"] + " at " + k);
                if (day[j]["module"]["module_id"] != day[k]["module"]["module_id"]) {
                  //console.log("TRYING DATES " + Date.parse('01/01/2017 ' + day[j]["start_time"]));
                  // Convert string HH:MM to Dates for comparison
                  var start1 = Date.parse('01/01/2017 ' + day[j]["start_time"]);
                  var end1 = Date.parse('01/01/2017 ' + day[j]["end_time"]);
                  var start2 = Date.parse('01/01/2017 ' + day[k]["start_time"]);
                  var end2 = Date.parse('01/01/2017 ' + day[k]["end_time"]);
                  if ((start1 == start2) || (start1 < start2 && end1 > start2) || (start2 < start1 && end2 > start1)) {
                    
                    //Date.parse('01/01/2011 10:20:45') > Date.parse('01/01/2011 5:10:10')
                    
                    console.log("There's a clash! " + day[j]["module"]["module_id"] + day[k]["module"]["module_id"] + Object.keys(data['timetable'])[i]);
                  
                    console.log("Type of clash" + day[j]["session_type_str"] + " " + day[k]["session_type_str"]);
                    
                    clashes.push({"module1": day[j]["module"]["module_id"], "module2": day[k]["module"]["module_id"],
                               "date": Object.keys(data['timetable'])[i], "module1_type": day[j]["session_type_str"], 
                               "module2_type": day[k]["session_type_str"]});
                    
            
                  }
                }
              }
            }
          }        
        }
        if (clashes.length == 0) {
          return response.send([{"module1": "noclash"}]);
        } else {
          return response.send(clashes);
        }
      } 
    })
    .catch(function (err) {
      console.log('timetable endpoint error');
      console.log(err);
      response.send([{"module1": false}]);
    });   

});


app.get("/oauth/userdata/:id/:key", function(request, response) {
  if (users[request.params.id]["auth_key"] == request.params.key) {
    response.send(JSON.stringify(
    {
      "ok": true,
      "name": users[request.params.id]["name"],
      "department": users[request.params.id]["department"],
      "token": users[request.params.id]["token"]
    }));
  }
  else {
    response.send(JSON.stringify(
    {
      "ok": false
    }))
  }
});

// listen for requests :)
var listener = app.listen(process.env.PORT, function () {
  console.log('Your app is listening on port ' + listener.address().port);
});
