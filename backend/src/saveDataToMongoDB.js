import mongoose from "mongoose";
import {BusRoute} from "./DBmodels/busline.js";
import {getRoutesWithStopTimes} from "./gtfsHelper.js";


/**
 * Method to save all routes with their stop times to MongoDB
 */
export async function saveRoutesToMongoDB() {
    // MongoDB connection
    await mongoose.connect('mongodb://mongodb:27017/TotallySpiesBusPlan', {
        useNewUrlParser: true,
        useUnifiedTopology: true,
    })
        .then(() => console.log('Connected to MongoDB'))
        .catch(err => console.error('Could not connect to MongoDB:', err));

    // Get all routes with their stop times
    const routesWithStops = await getRoutesWithStopTimes();

    // Iterate through and save all routes to MongoDB
    for (const route of routesWithStops) {
        const busRoute = new BusRoute(route);
        await busRoute.save();
    }
}
