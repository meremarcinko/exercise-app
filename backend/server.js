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

/* This actually starts the server and tells it to listen for requests on port 3000 */
app.listen(PORT, () => {
    console.log(`Server running at http://localhost:${PORT}`);
});