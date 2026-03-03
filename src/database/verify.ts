import { connectToDatabase, COLLECTIONS } from "./connection"

async function verify() {
    const { client, db } = await connectToDatabase()

    try {
        console.log("Verifying data in MongoDB...")
        const collections = Object.values(COLLECTIONS)

        for (const collName of collections) {
            const count = await db.collection(collName).countDocuments()
            console.log(`- Collection '${collName}': ${count} documents`)
        }
    } catch (error) {
        console.error("Error during verification:", error)
    } finally {
        await client.close()
        process.exit(0)
    }
}

verify()
