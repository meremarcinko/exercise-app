const express = require('express'); //go grab this package I downloaded and let me use it
const { readData, writeData } = require('./dataHelper');
const bcrypt = require('bcrypt');
const session = require('express-session');

const app = express(); //this creates the actual server application, calling express like a funtion creates a new Express app object and we save it in app. App is how you'll build everything, add routes, start the server, etc.
app.use(express.json()); //"if incoming requests have JSON data in their body, automatically read and parse it for me"

/* turns on session support for your whole app */
app.use(session({
    secret: 'replace-this-with-something-random-later', //this is used internally to securely sign the session cookie so it cant be tampered with
    resave: false, //tells it not to re-save the session if nothing changed (a performance best practice)
    saveUninitialized: false //dont create a session until something actually needs to be stored in it (also a best practice, avoids creating empty sessions for ever visitor)
}));

const PORT = 3000; //A "Port" is like a door number on your computer that the server listens through -> local host 3000


/* This is a route - a rule that says "when someone makes a certain kind of request to a certain URL, do this." */
app.get('/', (req, res) => {
    res.send('Hello! Your server is working 🎉');
});

app.get('/test-data', (req, res) => {
    const users = readData('users.json');
    res.json({ message: 'Here are the users!', users: users});
});

app.get('/test-write', (req, res) => {
    const users = readData('users.json'); //reads the current array of users
    const newUser = { id: 1, name: 'Test User'}; //creates a fake user object
    users.push(newUser); //adds the fake user to the array in memory
    writeData('users.json', users); //saves the updated array back to the actual file
    res.json({ message: 'New user added!', users: users }); //sends back confirmation plus the updated list
});


/* POST is used when the user is sending data (like a signup form), rather than just requesting a page
the async keyword means this function can use await inste it, which we need for the password hashing step */
app.post('/signup', async (req, res) => {
    const { email, password } = req.body; // pulls the email and password ther user typed out of the incoming request data

    const users = readData('users.json'); //searches through existing users to see if the email is already used

    const existingUser = users.find(user => user.email === email);
    if(existingUser) {
        return res.status(400).json({ message: 'An account with that email already exists.'});
    }

    //this scrambles the password. The 10 is the "cost factor" (how many times it scrambles it)
    const hashedPassword = await bcrypt.hash(password, 10);

    const newUser = {
        id: Date.now(), //a quick, easy way to generate a unique ID (the current timestamp in milliseconds)
        email: email,
        password: hashedPassword
    };

    users.push(newUser);
    writeData('users.json', users);

    res.json({ message: 'Account created!!', userId: newUser.id });
});

app.post('/login', async (req, res) => {
    const { email, password } = req.body;

    const users = readData('users.json');
    
    const user = users.find(user => user.email === email); //looks for a user with that email
    if(!user) {
        return res.status(400).json({ message: 'No account found with that email,'});
    }

    //takes the password the user typed out and compares it with the stored hash. Bcrypt handles all the comparison logic internally
    const passwordMatches = await bcrypt.compare(password, user.password);
    if(!passwordMatches) {
        return res.status(400).json({ message: 'Incorrect password.' });
    }

    req.session.userId = user.id; //is a special object that express-session give you. anything you put inside it gets rememberd for that specific browers across future requestion (cookie)

    res.json({ message: 'Login successful!', userId: user.id });
});

app.get('/whoami', (req, res) => {
    if(!req.session.userId) {
        return res.status(401).json({ message: 'You are not logged in.' });
    }
    res.json({ message: 'You are logged in!', userId: req.session.userId });
})

app.post('/logout', (req, res) => {
    req.session.destroy(error => {
        if(error) {
            return res.status(500).json({ message: 'Something went wrong logging out.'});
        }
        res.json({ message: 'Logged out successfully.' });
    })
})

function generateRandomCode() {
    const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let code = '';
    for( let i = 0; i < 6; i++) {
        code += characters.charAt(Math.floor(Math.random() * characters.length));
    }
    return code;
}

function isGroupAdmin(userId, groupId) {
    const memberships = readData('memberships.json');
    const membership = memberships.find(membership =>
        membership.userId === userId && membership.groupId === groupId);

    if (!membership) {
        return false;
    }

    return membership.role === 'admin';
}


app.post('/create-group', (req, res) => {
    //if -> checks that someone's actually logged in before letting them create a group
    if(!req.session.userId) {
        return res.status(401).json({ message: 'You must be logged in to create a group.'});
    }

    const { groupName, useRandomCode, customCode } = req.body;

    const groups = readData('groups.json');

    let code;
    if(useRandomCode) {
        code = generateRandomCode();
    } else {
        code = customCode;
    }

    const codeAlreadyTaken = groups.find(group => group.code.toLowerCase() === code.toLowerCase());
    if(codeAlreadyTaken) {
        return res.status(400).json({ message: 'That code is already in use. Please try a different one.'});
    }

    //we create theo new records here: the group itself, and a membership record linking the creator to that group with the admin - this is exactly why we use two separate JSON files instead of cramming everything into one
    const newGroup = {
        id: Date.now(),
        name: groupName,
        code: code,
        createdBy: req.session.userId,
        createdAt: new Date().toISOString()
    };

    groups.push(newGroup);
    writeData('groups.json', groups);

    const membership = readData('memberships.json');
    const newMembership = {
        id: Date.now() + 1,
        userId: req.session.userId,
        groupId: newGroup.id,
        role: 'admin',
        joinedAt: new Date().toISOString()
    };
    membership.push(newMembership);
    writeData('memberships.json', membership);

    res.json({ message: 'Group created!', group: newGroup });
})

app.post('/join-group', (req, res) => {
    if(!req.session.userId) {
        return res.status(401).json({ message: 'You must be logged in to join a group.' });
    }

    const { code } = req.body;

    const groups = readData('groups.json');

    const matchingGroup = groups.find(group => group.code.toLowerCase() === code.toLowerCase());
    if(!matchingGroup) {
        return res.status(400).json({ message: 'No group found with that code'});
    }

    const memberships = readData('memberships.json');

    const alreadyMember = memberships.find(membership =>
        membership.userId === req.session.userId && membership.groupId === matchingGroup.id);

    if (alreadyMember) {
        return res.status(400).json({ message: 'You are already a member of this group.'});
    }

    const newMembership = {
        id: Date.now(),
        userId: req.session.userId,
        groupId: matchingGroup.id,
        role: 'user',
        joinedAt: new Date().toISOString()
    };

    memberships.push(newMembership);
    writeData('memberships.json', memberships);

    res.json({ message: 'Joined group!', group: matchingGroup });

});

app.get('/my-groups', (req, res) => {
    if(!req.session.userId) {
        return res.status(401).json({ message: 'You must be logged in to see your groups.'});
    }

    const memberships = readData('memberships.json');
    const groups = readData('groups.json');

    //unlike .find() (which stops and resturns the first match) .fitler() goes through the entire array and returns a new array containing every item that matches the condidtion. We need this because a user could belong to multiple groups, so we want all of them, not just one
    const myMemberships = memberships.filter(membership => membership.userId === req.session.userId);

    //.map() gors through an array and transforms each item into something new, returning a new array of the transformed results. Here, we're taking each raw membership record and turning it into a nicer, more useful object that includes the actual group name and code.
    const myGroups = myMemberships.map(membership => {
        const matchingGroup = groups.find(group => group.id === membership.groupId);
        return {
            groupId: matchingGroup.id,
            groupName: matchingGroup.name,
            groupCode: matchingGroup.code,
            myRole: membership.role
        };
    });

    res.json({ message: 'Here are your groups!', groups: myGroups });
});

app.get('/group/:id/members', (req, res) => {
    if(!req.session.userId) {
        return res.status(401).json({ message: 'You must be logged in to see group members'});
    }

    const groupId = Number(req.params.id);

    const memberships = readData('memberships.json');
    const users = readData('users.json');

    const groupMemberships = memberships.filter(membership => membership.groupId === groupId);

    const isRequesterAMember = groupMemberships.find(membership => membership.userId === req.session.userId);
    if(!isRequesterAMember) {
        //401 means "we dont know who you are" (not logged in)
        //403 means "we know who you are, but you're not allowed to see this"
        return res.status(403).json({ message: 'You are not a member of this group.'});
    }

    const members = groupMemberships.map(membership => {
        const matchingUser = users.find(user => user.id === membership.userId);
        return {
            userId: matchingUser.id,
            email: matchingUser.email,
            role: membership.role,
            joinedAt: membership.joinedAt
        };
    });

    res.json({ message: 'Here are the group memebers!', members: members});
})

app.post('/promote-member', (req, res) => {
    if(!req.session.userId) {
        return res.status(401).json({ message: 'You must be logged in to do this.'});
    }

    const { groupId, targetUserId } = req.body;

    if(!isGroupAdmin(req.session.userId, groupId)) {
        return res.status(403).json({ message: 'Only admins can promote members.'});
    }

    const memberships = readData('memberships.json');

    const targetMembership = memberships.find(membership =>
        membership.userId === targetUserId && membership.groupId === groupId);
    
    if(!targetMembership) {
        return res.status(400).json({ message: 'That user is not a member of this group'});
    }

    //instead of building a new object like we have in every route so far, here we're directly modifying an existing object's property.
    targetMembership.role = 'admin';
    writeData('memberships.json', memberships);

    res.json({ message: 'Member promoted to admin!', membership: targetMembership });

    //!!!!! JS concept: objects and arrays are passed around by reference, not by copu. targetMembership isnt a separate clone - its point at the literal same object that lives inside the membership array
});

app.post('/remove-member', (req, res) => {
    if(!req.session.userId) {
        return res.status(401).json({message: 'You must be logged in to do this.' });
    }

    const { groupId, targetUserId } = req.body;

    if(!isGroupAdmin(req.session.userId, groupId)) {
        return res.status(403).json({ message: 'Only admins can remove members.'});
    }

    const memberships = readData('memberships.json');

    const targetMembership = memberships.find(membership =>
        membership.userId === targetUserId && membership.groupId === groupId);
    
    if(targetMembership.role === 'admin') {

        //filter() -> instead of literally deleting omething, we create a new array that contains every membership expect the target one. The "!" at the start of the condidtion means "keep everything that does NOT match this user+group combination"
        const adminCount = memberships.filter(membership =>
            membership.groupId === groupId && membership.role === 'admin').length;

        if(adminCount <= 1) {
            return res.status(400).json({message: 'Cannot removed the last remaining admin of a group'});
        }
    }

    const updatedMemberships = memberships.filter(membership =>
        !(membership.userId === targetUserId && membership.groupId === groupId));

    writeData('memberships.json', updatedMemberships);

    res.json({ message: 'Member removed from group.' });
})

app.post('/setup-profile', (req, res) => {
    if(!req.session.userId) {
        return res.status(401).json({ message: 'You must be logged in to set up your profile.'});
    }

    const { nickname, preferredExercise, funFact, song, notificationsEnabled, goalMeters } = req.body;

    const users = readData('users.json');

    const user = users.find(user => user.id === req.session.userId);
    if(!user) {
        return res.status(404).json({ message: 'User not found.' });
    }

    user.nickname = nickname;
    user.preferredExercise = preferredExercise;
    user.funFact = funFact;
    user.song = song;
    user.notificationsEnabled = notificationsEnabled;
    user.goalMeters = goalMeters;

    writeData('users.json', users);
    res.json({ message: 'Profile saved!', user: {
        id: user.id,
        email: user.email,
        nickname: user.nickname,
        preferredExercise: user.preferredExercise,
        funFact: user.funFact,
        song: user.song,
        notificationsEnabled: user.notificationsEnabled,
        goalMeters: user.goalMeters
    }});
});

app.get('/my-profile', (req, res) => {
    if(!req.session.userId) {
        return res.status(401).json({ message: 'You must be logged in to view your porfile'});
    }

    const users = readData('users.json');

    const user = users.find(user => user.id === req.session.userId);
    if (!user) {
        return res.status(404).json({ message: 'User not found.'});
    }

    res.json({ message: 'Here is your profile!', user: {
        id: user.id,
        email: user.email,
        nickname: user.nickname,
        preferredExercise: user.preferredExercise,
        funFact: user.funFact,
        song: user.song,
        notificationsEnabled: user.notificationsEnabled,
        goalMeters: user.goalMeters
    }});
});

app.put('/update-profile', (req,res) => {
    if(!req.session.userId) {
        return res.status(401).json({ message: 'You must be logged in to update your profile.'});
    }

    const { nickname, preferredExercise, funFact, song, notificationsEnabled, goalMeters } = req.body;

    const users = readData('users.json');

    const user = users.find(user => user.id === req.session.userId);
    if(!user) {
        return res.status(404).json({ message: 'User not found.'});
    }

    if(nickname !== undefined) user.nickname = nickname;
    if(preferredExercise !== undefined) user.preferredExercise = preferredExercise;
    if(funFact !== undefined) user.funFact = funFact;
    if(song !== undefined) user.song = song;
    if(notificationsEnabled !== undefined) user.notificationsEnabled = notificationsEnabled;
    if(goalMeters !== undefined) user.goalMeters = goalMeters;
    
    writeData('users.json', users);

    res.json({ message: 'Profile updated!', user: {
        id: user.id,
        email: user.email,
        nickname: user.nickname,
        preferredExercise: user.preferredExercise,
        funFact: user.funFact,
        song: user.song,
        notificationsEnabled: user.notificationsEnabled,
        goalMeters: user.goalMeters
    }});
});

app.post('/log-entry', (req, res) => {
    if(!req.session.userId) {
        return res.status(401).json({ message: 'You must be logged in to log an entry.'});
    }

    const { groupId, date, exerciseType, distance, unit, durationSeconds, notes } = req.body;

    const memberships = readData('memberships.json');
    const isMember = memberships.find(membership =>
        membership.userId === req.session.userId && membership.groupId === groupId);
        if (!isMember) {
            return res.status(403).json({ message: 'You are not a member of this group.'});
        }

        const meters = unit === 'miles' ? distance * 1609 : distance;

        const entries = readData('entries.json');

        const newEntry = {
            id: Date.now(),
            userId: req.session.userId,
            groupId: groupId,
            date: date,
            exerciseType: exerciseType,
            meters: meters,
            originalUnit: unit,
            durationSeconds: durationSeconds || null,
            notes: notes || null,
            createdAt: new Date().toISOString()
        };

        entries.push(newEntry);
        writeData('entries.json', entries);

        res.json({ message: 'Entry logged!', entry: newEntry });
});

app.get('/my-entries', (req,res) => {
    if(!req.session.userId) {
        return res.status(401).json({ message: 'You must be logged in to view your entires.' });
    }

    //For Get requests, we cant send a request body, so instead we pass data through the URL itself as a query string. The ?groupId= part is the query string, and Express automatically parses it into req.query
    const { groupId } = req.query;

    const entries = readData('entries.json');

    const myEntries = entries.filter(entry =>
        entry.userId === req.session.userId && entry.groupId === Number(groupId));
        //query string values always arrive as strings, so we convert to a number before comparing against the numeric IDs stored in the JSON file

    res.json({ message: 'Here are your entries!', entries: myEntries });
});

app.get('/my-stats', (req, res) => {
    if(!req.session.userId) {
        return res.status(401).json({ message: 'You must be logged in to view your stats.'});
    }

    const { groupId } = req.query;

    const entries = readData('entries.json');
    const users = readData('users.json');

    const user = users.find(user => user.id === req.session.userId);
    if(!user) {
        return res.status(404).json({ message: 'User not found.' });
    }

    const myEntries = entries.filter(entry =>
        entry.userId === req.session.userId && entry.groupId === Number(groupId));

    const now = new Date();
    const currentMonth = now.getMonth(); //pulls the month (0-11, where 0 is january) and the year out of a date object
    const currentYear = now.getFullYear();

    const monthlyEntries = myEntries.filter(entry => {
        const entryDate = new Date(entry.date);
        return entryDate.getMonth() === currentMonth && entryDate.getFullYear() ===currentYear;
    });

    //.reduce() goes through an array and accumulates a single value. The 0 at the end is the starting value, and for each entry it adds 'entry.meters' to the running total. its the standard way to sum an array of numbers.
    const monthlyTotal = monthlyEntries.reduce((total, entry) => total + entry.meters, 0);
    const allTimeTotal = myEntries.reduce((total, entry) => total + entry.meters, 0);

    const goalMeters = user.goalMeters || 0;
    const goalProgress = goalMeters > 0 ? Math.round((monthlyTotal / goalMeters) * 100) : null;

    //a Set is like an array but with no duplicates. We use it to collect all unique dates the user has logged entries on, which makes the streak calcumation fast (checking if the date exists in a Set is instant)
    const entryDates = new Set(myEntries.map(entry => entry.date));
    
    let streak = 0;
    const today = new Date();
    today.setHours(0,0,0,0);

    let checkDate = new Date(today);
    let missedOneDay = false;

    while(true) {
        const dateString = checkDate.toISOString().split('T')[0];

        if(entryDates.has(dateString)) {
            streak++;
            missedOneDay = false;
        }else if(!missedOneDay) {
            missedOneDay = true;
        }else{
            break;
        }

        checkDate.setDate(checkDate.getDate() - 1);
    }

    res.json({
        message: 'Here are your stats!',
        stats: {
            monthlyTotal,
            allTimeTotal,
            goalMeters,
            goalProgress,
            streak
        }
    });
});

app.get('/group-stats', (req, res) => {
    if(!req.session.userId) {
        return res.status(401).json({ message: 'You must be logged in to view group stats.' });
    }

    const { groupId } = req.query;

    const memberships = readData('memberships.json');
    const entries = readData('entries.json');
    const users = readData('users.json');

    const isMember = memberships.find(membership =>
        membership.userId === req.session.userId && membership.groupId === Number(groupId));
    if(!isMember) {
        return res.status(403).json({ message: 'You are not a member of this group.'});
    }

    const groupMemberships = memberships.filter(membership =>
        membership.groupId === Number(groupId));

    const groupEntries = entries.filter(entry =>
        entry.groupId === Number(groupId));

    const now = new Date();
    const currentMonth = now.getMonth();
    const currentYear = now.getFullYear();

    const monthlyGroupEntries = groupEntries.filter(entry => {
        const entryDate = new Date(entry.date);
        return entryDate.getMonth() === currentMonth && entryDate.getFullYear() === currentYear;
    });

    //helper function defined inside the route
    function getFairnessScore(entry) {
        if(entry.exerciseType === 'swimming') {
            return entry.meters / 500;
        } else {
            return entry.meters / 1609;
        }
    }

    const leaderboard = groupMemberships.map(membership => {
        const memberUser = users.find(user => user.id === membership.userId);
        const memberEntries = monthlyGroupEntries.filter(entry =>
            entry.userId === membership.userId);
        const fairnessScore = memberEntries.reduce((total, entry) =>
        total + getFairnessScore(entry), 0);
        return {
            userId: membership.userId,
            //if a user hasnt set a nickname yet, fall back to show their email (code below)
            nickname: memberUser ? memberUser.nickname || memberUser.email : 'Unknown',
            role: membership.role,
            fairnessScore: Math.round(fairnessScore * 100)/ 100
        };
    });

    //sorts the leaderbaord highest to lowest
    //the sort function returns a negative number when b should come first, which JS '.sort()' uses to order things
    leaderboard.sort((a, b) => b.fairnessScore - a.fairnessScore);
    const groupTotal = leaderboard.reduce((total, member) =>
    total + member.fairnessScore, 0);

    const topScore = leaderboard[0].fairnessScore;
    const topMembers = leaderboard
        .filter(member => member.fairnessScore === topScore)
        .map(member => member.nickname);

    const dayCounts = {}; //an empty object used as a counter. For each entry date, we either start counting at 1 or add 1
    monthlyGroupEntries.forEach(entry => {
        dayCounts[entry.date] = (dayCounts[entry.date] || 0) + 1;
    });

    let mostActiveDay = null;
    let mostActiveDayCount = 0;
    Object.entries(dayCounts).forEach(([date, count]) => {
        if(count > mostActiveDayCount) {
            mostActiveDay = date;
            mostActiveDayCount = count;
        }
    });

    res.json({
        message: 'Here are the group stats!',
        stats: {
            leaderboard,
            groupTotal: Math.round(groupTotal * 100) / 100,
            topMembers,
            mostActiveDay,
            mostActiveDayCount
        }
    });
});

app.post('/suggest-event', (req, res) => {
    if(!req.session.userId) {
        return res.status(401).json({ message: 'You must be logged in to suggest an event. '});
    }

    const { groupId, title, date, description } = req.body;

    const memberships = readData('memberships.json');
    const isMember = memberships.find(membership =>
        membership.userId === req.session.userId && membership.groupId === groupId);
    if(!isMember) {
        return res.status(403).json({ message: 'You are not a member of this group.'});
    }

    const events = readData('events.json');

    const newEvent = {
        id: Date.now(),
        groupId: groupId,
        suggestedBy: req.session.userId,
        title: title,
        date: date,
        description: description || null,
        createdAt: new Date().toISOString(),
        rsvps: [],
        locations: []
    };

    events.push(newEvent);
    writeData('events.json', events);

    res.json({ message: 'Event suggested!', event: newEvent});
});

app.post('/rsvp', (req, res) => {
    if(!req.session.userId) {
        return res.status(401).json({ message: 'You must be logged in to RSVP.'});
    }

    const { eventId, response } = req.body;

    //.includes() returns true is the value exists in the array, false if not
    if(!['yes', 'no', 'maybe'].includes(response)) {
        return res.status(400).json({ message: 'Response must be yes, no or maybe'});
    }

    const events = readData('events.json');

    const event = events.find(event => event.id === eventId);
    if(!event) {
        return res.status(404).json({ message: 'Event not found.'});
    }

    const memberships = readData('memberships.json');
    const isMember = memberships.find(membership =>
        membership.userId === req.session.userId && membership.groupId === event.groupId);
    if(!isMember){
        return res.status(403).json({ message: 'You are not a member of this group.' });
    }

    const existingRsvp = event.rsvps.find(rsvp => rsvp.userId === req.session.userId);
    if(existingRsvp) {
        existingRsvp.response = response;
    } else {
        event.rsvps.push({ userId: req.session.userId, response: response });
    }

    writeData('events.json', events);

    res.json({ message: 'RSVP saved!', event: event });
});

app.post('/suggest-location', (req, res) => {
    if(!req.session.userId) {
        return res.status(401).json({ message: 'You must be logged in to suggest a location.' });
    }

    const { eventId, locationName } = req.body;

    const events = readData('events.json');

    const event = events.find(event => event.id === eventId);
    if(!event) {
        return res.status(404).json({message: 'Event not found.' });
    }

    const memberships = readData('memberships.json');
    const isMember = memberships.find(membership =>
        membership.userId === req.session.userId && membership.groupId === event.groupId);
        if(!isMember) {
            return res.status(403).json({ message: 'You are not a member of this group.'});
        }

    const newLocation = {
        id: Date.now(),
        name: locationName,
        suggestedBy: req.session.userId,
        votes: []
    };

    event.locations.push(newLocation);
    writeData('events.json', events);

    res.json({ message: 'Location suggested!', location: newLocation});
});

app.post('/vote-location', (req, res) => {
    if(!req.session.userId) {
        return res.status(401).json({ message: 'You must be logged in to vote.'});
    }
    
    const { eventId, locationId } = req.body;

    const events = readData('events.json');

    const event = events.find(event => event.id === eventId);
    if(!event) {
        return res.status(404).json({ message: 'Event not found'});
    }

    const memberships = readData('memberships.json');
    const isMember = memberships.find(membership =>
        membership.userId === req.session.userId && membership.groupId === event.groupId);
    if(!isMember) {
        return res.status(403).json({ message: 'You are not a member of this group.'});
    }
    
    const location = event.locations.find(location => location.id === locationId);
    if(!location) {
        return res.status(404).json({ message: 'Location not found.'});
    }

    const alreadyVoted = location.votes.includes(req.session.userId);
    if(alreadyVoted) {
        location.votes = location.votes.filter(userId => userId !== req.session.userId);
        writeData('events.json', events);
        return res.json({ message: 'Vote removed!', location: location });
    }

    location.votes.push(req.session.userId);
    writeData('events.json', events);

    res.json({ message: 'Vote added!', location: location });
});

/* This actually starts the server and tells it to listen for requests on port 3000 */
app.listen(PORT, () => {
    console.log(`Server running at http://localhost:${PORT}`);
});