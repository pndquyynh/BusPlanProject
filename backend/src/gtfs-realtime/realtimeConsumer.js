import {Kafka} from "kafkajs";
import mongoose from "mongoose";

import {congestionLevel} from "../utils/congestionLevel.js";
import {VehiclePositions} from "../DBmodels/vehiclepositions.js";
import {Route, Trip} from "../DBmodels/busline.js";

const kafka = new Kafka({
    clientId: 'my-app',
    brokers: ['kafka:19092']
});

class IVehicleDataProcessor {
    createNewVehicle(vehicle) {
        throw new Error("Method 'process()' must be implemented.");
    }
    updateVehicle(vehicle){
        throw new Error("Method 'process()' must be implemented.");
    }
}

// AmsterdamVehicleDataProcessor.js
class AmsterdamVehicleDataProcessor extends IVehicleDataProcessor {
    createNewVehicle(vehicle,existingTrip,route,city) {
        return new VehiclePositions({
            city: city,
            currentTrip_id: existingTrip._id,
            route: route._id,
            timestamp: vehicle.vehicle.timestamp || new Date(),
            current_position: {
                latitude: vehicle.vehicle.position.latitude,
                longitude: vehicle.vehicle.position.longitude
            },
            previous_position: {
                latitude: null,
                longitude: null
            },
            stop_id: vehicle.vehicle.stopId,
            current_stop_sequence: vehicle.vehicle.currentStopSequence,
            current_status: vehicle.vehicle.currentStatus,
            congestion_level: {
                timestamp: new Date(),  // Using current timestamp as default
                level: 0, // Setting level as 0 by default
                previousStop: null,
                currentStop: null
            }
        });
    }
    async updateVehicle(vehicle, existingPosition, existingTrip) {
        // Calculate congestion level
        const previousPosition = {
            position: existingPosition.current_position,
            timestamp: existingPosition.timestamp
        };
        const currentPosition = {position: vehicle.vehicle.position, timestamp: vehicle.vehicle.timestamp};


        const route = await Route.findOne({_id: existingTrip.route_id});
        if (existingPosition.current_position.latitude !== vehicle.vehicle.position.latitude || existingPosition.current_position.latitude !== vehicle.vehicle.position.longitude) {

            const vehicleInfo = {
                trip_id: existingTrip.trip_id,
                stopSequence: vehicle.vehicle.currentStopSequence,
                positions: [previousPosition, currentPosition]
            }

            const congestion = await congestionLevel(route.route_id, vehicleInfo);

            existingPosition.congestion_level.timestamp = new Date();
            existingPosition.congestion_level.level = congestion.congestionLevel;
            existingPosition.congestion_level.previousStop = congestion.previousStop;
            existingPosition.congestion_level.currentStop = congestion.currentStop;
        }
        existingPosition.previous_position.latitude = existingPosition.current_position.latitude;
        existingPosition.previous_position.longitude = existingPosition.current_position.longitude;
        existingPosition.current_position.latitude = vehicle.vehicle.position.latitude;
        existingPosition.current_position.longitude = vehicle.vehicle.position.longitude;
        existingPosition.timestamp = vehicle.vehicle.timestamp || new Date(); // Just making sure there's a fallback
        existingPosition.current_stop_sequence = vehicle.vehicle.currentStopSequence;
        existingPosition.current_status = vehicle.vehicle.current_status;
        existingPosition.stop_id = vehicle.vehicle.stopId;

    }
}

// StockholmVehicleDataProcessor.js
class StockholmVehicleDataProcessor extends IVehicleDataProcessor {
    createNewVehicle(vehicle,existingTrip,route,city) {
        return new VehiclePositions({
            city: city,
            currentTrip_id: existingTrip._id,
            route: route._id,
            timestamp: vehicle.vehicle.timestamp || new Date(),
            current_position: {
                latitude: vehicle.vehicle.position.latitude,
                longitude: vehicle.vehicle.position.longitude
            },
            congestion_level: {
                timestamp: new Date(),  // Using current timestamp as default
                level: 0, // Setting level as 0 by default
                previousStop: null,
                currentStop: null
            }
        })
    }
    updateVehicle(vehicle) {

    }

}


async function setupConsumerForCity(topic,city) {
    const consumer = kafka.consumer({groupId: `gtfs-realtime-group-${topic}`});

    await mongoose.connect('mongodb://mongodb:27017/TotallySpiesBusPlan', {
        serverSelectionTimeoutMS: 60000
    });
    await VehiclePositions.deleteMany();
    await consumer.connect();
    await consumer.subscribe({topic});

    let processor;
    if (city === 'amsterdam') {
        processor = new AmsterdamVehicleDataProcessor();
    } else if (city === 'stockholm') {
        processor = new StockholmVehicleDataProcessor();
    }


    await consumer.run({
        eachMessage: async ({topic, partition, message}) => {
            const rawData = message.value.toString();
            const data = JSON.parse(rawData);


            for (const vehicle of data) {
                //if (vehicle.vehicle.currentStatus === "IN_TRANSIT_TO" || vehicle.vehicle.currentStatus === "STOPPED_AT") {

                if (!vehicle || !vehicle.vehicle || !vehicle.vehicle.trip) {
                    console.error('Invalid vehicle data format:', vehicle);
                    continue; // Skip this iteration because the structure is not as expected
                }

                // Now you can safely check for 'tripId'
                if (!vehicle.vehicle.trip.tripId) {
                    console.error('Trip ID is undefined for vehicle:', vehicle);
                    continue; // Skip this iteration because tripId is undefined
                }

                // Check if the trip exists in the database

                    console.log("vehicleID", vehicle);
                    const existingTrip = await Trip.findOne({trip_id: vehicle.vehicle.trip.tripId});
                    console.log("existing trip", existingTrip);
                    if (!existingTrip) {
                        console.log(`Trip ID ${vehicle.vehicle.trip.tripId} not in the database.`);
                        continue;  // Skip this vehicle
                    }

                    const existingPosition = await VehiclePositions.findOne({currentTrip_id: existingTrip._id});
                     console.log("existing position", existingPosition);
                     if (existingPosition) {
                    // Update existing entry

                    await processor.updateVehicle(vehicle, existingPosition, existingTrip);

                    await existingPosition.save();


                } else {
                    // Create new entry
                    const route = await Route.findOne({_id: existingTrip.route_id});

                    const newPosition = processor.createNewVehicle(vehicle.vehicle, existingTrip, route, city);
                    await newPosition.save();
                }
                     // }


            }
            console.log("done");


        }

    });

}


async function run() {
    try {
        await setupConsumerForCity('gtfs-realtime-amsterdam','amsterdam');
        await setupConsumerForCity('gtfs-realtime-stockholm','stockholm');
        // Add more cities as needed
    } catch (error) {
        console.error(error);
    }
}

run();


