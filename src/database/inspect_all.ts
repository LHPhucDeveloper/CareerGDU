import { MongoClient } from "mongodb"

async function inspectAll() {
    const uri = process.env.MONGODB_URI || "mongodb://localhost:27017"
    const client = new MongoClient(uri)

    try {
        await client.connect()
        console.log("Connected to MongoDB")

        const admin = client.db().admin()
        const dbs = await admin.listDatabases()

        console.log("Databases on server:")
        for (const d of dbs.databases) {
            console.log(`- ${d.name}`)
            const db = client.db(d.name)
            const collections = await db.listCollections().toArray()
            for (const col of collections) {
                const count = await db.collection(col.name).countDocuments()
                console.log(`  * ${col.name}: ${count} docs`)
            }
        }
    } catch (error) {
        console.error("Error:", error)
    } finally {
        await client.close()
        process.exit(0)
    }
}

inspectAll()
