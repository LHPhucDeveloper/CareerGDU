import { connectToDatabase } from "./connection"

async function checkSpecificData() {
    const { client, db } = await connectToDatabase()

    try {
        const userId = "6976cb41546328fb3dba5e42" // Florentino ID from backups/2026-03-02_12-13-43/users.json
        const user = await db.collection("users").findOne({ _id: userId })

        if (user) {
            console.log(`FOUND user 'Florentino' with ID ${userId}:`, JSON.stringify(user, null, 2))
        } else {
            console.log(`NOT FOUND user 'Florentino' with ID ${userId}`)

            // List first 3 users to see what's there
            const firstUsers = await db.collection("users").find().limit(3).toArray()
            console.log("First 3 users in DB:", JSON.stringify(firstUsers, null, 2))
        }
    } catch (error) {
        console.error("Error:", error)
    } finally {
        await client.close()
        process.exit(0)
    }
}

checkSpecificData()
