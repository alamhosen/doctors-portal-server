const express = require('express');
const cors = require('cors');
const { MongoClient, ServerApiVersion } = require('mongodb');
require('dotenv').config()
const app = express()
const port = process.env.PORT || 5000

// midleware
app.use(cors());
app.use(express.json());

const uri = "mongodb+srv://doctor_admin:5B3y4ZznvWi7N57m@cluster0.wek5l.mongodb.net/myFirstDatabase?retryWrites=true&w=majority";
const client = new MongoClient(uri, { useNewUrlParser: true, useUnifiedTopology: true, serverApi: ServerApiVersion.v1 });

async function run() {
    try {
        await client.connect();
        const serviceCollection = client.db('doctors_portal').collection('services');
        const bookingCollection = client.db('doctors_portal').collection('bookings');

        app.get('/service', async (req, res) => {
            const query = {};
            const cursor = serviceCollection.find(query);
            const services = await cursor.toArray();
            res.send(services);
        })

        app.get('/available', async(req, res) => {
            const date = req.query.date || 'May 15, 2022';
             // step 1:  get all services
             const services = await serviceCollection.find().toArray();

             // step 2: get the booking of that day. output: [{}, {}, {}, {}, {}, {}]
             const query = {date: date};
             const bookings = await bookingCollection.find(query).toArray();
            // step 3: for each service
            services.forEach(service => {
                const serviceBookings = bookings.filter(book => book.treatment === service.name);
                const booked= serviceBookings.map(s => s.slot);
                const available = service.slots.filter(s => !booked.includes(s));
                service.available = available;
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
   app.post('/booking', async(req, res) =>{
       const booking = req.body;
       const query = {treatment: booking.treatment, date: booking.date, pathent: booking.pathent}
       const exists = await bookingCollection.findOne(query)
       if(exists){
           return res.send({success: false, booking: exists})
       }
       const result = await bookingCollection.insertOne(booking);
       res.send({success: true, booking: result});
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