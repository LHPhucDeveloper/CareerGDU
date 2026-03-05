import { connectToDatabase, COLLECTIONS } from "./connection"
import { ObjectId } from "mongodb"

async function fixIds() {
    const { client, db } = await connectToDatabase()
    console.log("Starting ID fix (String -> ObjectId)...")

    try {
        const collections = Object.values(COLLECTIONS)

        for (const colName of collections) {
            console.log(`Processing collection: ${colName}...`)
            const col = db.collection(colName)

            // Find all documents where _id is a string and matches ObjectId format
            const docs = await col.find({ _id: { $type: "string" } }).toArray()
            console.log(`  Found ${docs.length} documents with string _id.`)

            for (const doc of docs) {
                const stringId = doc._id as string
                if (ObjectId.isValid(stringId) && stringId.length === 24) {
                    try {
                        const newId = new ObjectId(stringId)

                        // We can't update _id, so we must delete and re-insert
                        const { _id, ...rest } = doc
                        await col.deleteOne({ _id: stringId })
                        await col.insertOne({ ...rest, _id: newId })
                        // console.log(`  Converted ${stringId} to ObjectId`)
                    } catch (e) {
                        // console.error(`  Failed to convert ${stringId}`)
                    }
                }
            }
            console.log(`  Finished ${colName}`)
        }

        console.log("ID fix completed successfully!")
    } catch (error) {
        console.error("Error during ID fix:", error)
    } finally {
        await client.close()
        process.exit(0)
    }
}

fixIds()
