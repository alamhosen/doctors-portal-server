const express = require('express');
const cors = require('cors');
require('dotenv').config();
const nodemailer = require('nodemailer');
const sgTransport = require('nodemailer-sendgrid-transport');
const jwt = require('jsonwebtoken');
const { MongoClient, ServerApiVersion } = require('mongodb');
const app = express()
const port = process.env.PORT || 5000

// midleware
app.use(cors());
app.use(express.json());
const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.wek5l.mongodb.net/myFirstDatabase?retryWrites=true&w=majority`;
const client = new MongoClient(uri, { useNewUrlParser: true, useUnifiedTopology: true, serverApi: ServerApiVersion.v1 });

function verifyjwt(req, res, next) {
    const authHeader = req.headers.authorization;
    if (!authHeader) {
        return res.status(401).send({ message: 'Unauthorized access' })
    }
    const token = authHeader.split(' ')[1];
    jwt.verify(token, '8cfacee9fa01f254d9d40edcc8814a60b9ed54cf480360fe0e324cd375507389d49c0b926248c6ec58aa9dce516c1dcc3e2f639179668776f0b1ba283910cd1a', function (err, decoded) {
        if (err) {
            return res.status(403).send({ message: 'Forbidden access' })
        }
        req.decoded = decoded;
        next();
    });
}

// send appointment email start

const emailSenderOptions = {
    auth: {
      api_key: process.env.EMAIL_SENDER_KEY
    }
  }

  const emailClient = nodemailer.createTransport(sgTransport(emailSenderOptions));

function sendAppointmentEmail(booking) {
    const {patient, patientName, treatment, date, slot} = booking;
    console.log(patient);

    var email = {
        from: process.env.EMAIL_FROM,
        to: patient,
        subject: `Your Appointment for ${treatment} is on ${date} at ${slot} is Confirmed`,
        text: `Your Appointment for ${treatment} is on ${date} at ${slot} is Confirmed`,
        html: `
        <div>
        <p> Hello ${patientName}, </p>
        <h3>Your Appointment for ${treatment} is confirmed</h3>
        <p>Looking forward to seeing you on ${date} at ${slot}.</p>
        
        <h3>Our Address</h3>
        <p>Andor Killa Bandorban</p>
        <p>Bangladesh</p>
        <a href="https://web.programming-hero.com/">unsubscribe</a>
      </div>
        `
      };
      
      emailClient.sendMail(email, function(err, info){
          if (err ){
            console.log(err);
          }
          else {
            console.log('Message sent: ', info);
          }
      });

}

// send appointment email start

async function run() {
    try {
        await client.connect();
        const serviceCollection = client.db('doctors_portal').collection('services');
        const bookingCollection = client.db('doctors_portal').collection('bookings');
        const userCollection = client.db('doctors_portal').collection('users');
        const doctorCollection = client.db('doctors_portal').collection('doctors');

        const verifyAdmin = async (req, res, next) => {
            const requester = req.decoded.email;
            const requesterAccount = await userCollection.findOne({ email: requester });
            if (requesterAccount.role === 'admin') {
              next();
            }
            else {
              res.status(403).send({ message: 'forbidden' });
            }
          }

        app.get('/service', async (req, res) => {
            const query = {};
            const cursor = serviceCollection.find(query).project({name: 1});
            const services = await cursor.toArray();
            res.send(services);
        })

        // get users
        app.get('/user', verifyjwt, async (req, res) => {
            const users = await userCollection.find().toArray();
            res.send(users);
        })

        // put users
        app.put('/user/:email', async (req, res) => {
            const email = req.params.email;
            const user = req.body;
            const filter = { email: email };
            const options = { upsert: true };
            const updateDoc = {
                $set: user,
            };
            const result = await userCollection.updateOne(filter, updateDoc, options)
            const token = jwt.sign({ email: email }, '8cfacee9fa01f254d9d40edcc8814a60b9ed54cf480360fe0e324cd375507389d49c0b926248c6ec58aa9dce516c1dcc3e2f639179668776f0b1ba283910cd1a', { expiresIn: '1d' })
            res.send({ result, token });
        })

        // isAdmin verify
        app.get('/admin/:email', async(req, res) =>{
            const email = req.params.email;
            const user = await userCollection.findOne({email: email})
            const isAdmin = user.role === 'admin'
            res.send({admin: isAdmin})
        })

        // make user admin
        app.put('/user/admin/:email', verifyjwt, async (req, res) => {
            const email = req.params.email;
            const requester = req.decoded.email;
            const requesterAccount = await userCollection.findOne({ email: requester });

            if (requesterAccount === 'admin') {
                const filter = { email: email };
                const updateDoc = {
                    $set: { role: 'admin' },
                };
                const result = await userCollection.updateOne(filter, updateDoc);
                res.send(result);
            }
            else{
                res.status(403).send({message: 'forbidden'})
            }

        })

        // Warning: This is not the proper way to query multiple collection. 
        // After learning more about mongodb. use aggregate, lookup, pipeline, match, group

        app.get('/available', async (req, res) => {
            const date = req.query.date || 'May 15, 2022';
            // step 1:  get all services
            const services = await serviceCollection.find().toArray();

            // step 2: get the booking of that day. output: [{}, {}, {}, {}, {}, {}]
            const query = { date: date };
            const bookings = await bookingCollection.find(query).toArray();
            // step 3: for each service
            services.forEach(service => {
                // step 4: find bookings for that service. output: [{}, {}, {}, {}]
                const serviceBookings = bookings.filter(book => book.treatment === service.name);
                // step 5: select slots for the service Bookings: ['', '', '', '']
                const bookedSlots = serviceBookings.map(book => book.slot);

                // step 6: select those slots that are not in bookedSlots
                const available = service.slots.filter(slot => !bookedSlots.includes(slot));
                //step 7: set available to slots to make it easier 
                service.slots = available;
                // services.booked= serviceBookings.map(s => s.slot);
            })
            res.send(services)
        })

        /**
     * API Naming Convention
     * app.get('/booking') // get all bookings in this collection. or get more than one or by filter
     * app.get('/booking/:id') // get a specific booking 
     * app.post('/booking') // add a new booking
     * app.patch('/booking/:id) //
     * app.delete('/booking/:id) //
    */

        app.get('/booking', verifyjwt, async (req, res) => {
            const patient = req.query.patient;
            const decodedEmail = req.decoded.email;
            if (patient === decodedEmail) {
                const query = { patient: patient };
                const bookings = await bookingCollection.find(query).toArray();
                return res.send(bookings);
            }
            else {
                return res.status(403).send({ message: 'Forbidded access' })
            }
        })

        app.post('/booking', async (req, res) => {
            const booking = req.body;
            const query = { treatment: booking.treatment, date: booking.date, patient: booking.patient }
            const exists = await bookingCollection.findOne(query)
            if (exists) {
                return res.send({ success: false, booking: exists })
            }
            const result = await bookingCollection.insertOne(booking);
            // send appointment mail start 
            console.log('sending email');
            sendAppointmentEmail(booking)
            // send appointment mail end 
            res.send({ success: true, booking: result });
        });

        // load doctors
        app.get('/doctor', verifyjwt, verifyAdmin, async(req, res) => {
            const doctor = await doctorCollection.find().toArray();
            res.send(doctor);
        })

        // add doctor
        app.post('/doctor', verifyjwt, verifyAdmin, async(req, res) =>{
            const doctor = req.body;
            const result = await doctorCollection.insertOne(doctor);
            res.send(result);
        })

        // delete doctor
        app.delete ('/doctor/:email',verifyjwt, verifyAdmin, async(req, res) =>{
            const email = req.params.email;
            const filter = {email: email};
            const result = await doctorCollection.deleteOne(filter);
            res.send(result);
        })


    }
    finally {

    }
}
run().catch(console.dir);

console.log(uri);

app.get('/', (req, res) => {
    res.send('Hello from doctors!')
})

app.listen(port, () => {
    console.log(`Doctors app listening on port ${port}`)
})