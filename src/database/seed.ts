import fs from "fs"
import path from "path"
import { connectToDatabase, COLLECTIONS } from "./connection"

async function seed() {
    console.log("Starting database seeding from backup...")
    const { client, db } = await connectToDatabase()

    // Specific backup folder requested by user
    const backupDir = path.join(process.cwd(), "backups/2026-03-02_12-13-43")

    try {
        if (!fs.existsSync(backupDir)) {
            console.error(`Backup directory not found: ${backupDir}`)
            return
        }

        const files = fs.readdirSync(backupDir).filter(file => file.endsWith(".json"))
        console.log(`Found ${files.length} backup files.`)

        for (const file of files) {
            const collectionName = file.replace(".json", "")
            const filePath = path.join(backupDir, file)

            console.log(`Processing ${file} -> collection: ${collectionName}...`)

            const fileContent = fs.readFileSync(filePath, "utf8")
            let data: any[]

            try {
                data = JSON.parse(fileContent)
            } catch (e) {
                console.error(`Error parsing ${file}:`, e)
                continue
            }

            if (!Array.isArray(data)) {
                // If it's the jobs.json structure we saw earlier with { jobs: [...] }
                if (data && (data as any).jobs && Array.isArray((data as any).jobs)) {
                    data = (data as any).jobs
                } else {
                    console.warn(`Skipping ${file}: data is not an array.`)
                    continue
                }
            }

            if (data.length === 0) {
                console.log(`Skipping ${file}: array is empty.`)
                continue
            }

            // Special case: mapping "reports" to whatever is in COLLECTIONS.REPORTS if different
            // but in our case COLLECTIONS.REPORTS is "reports".

            await db.collection(collectionName).deleteMany({})
            await db.collection(collectionName).insertMany(data)
            console.log(`Successfully imported ${data.length} documents into ${collectionName}`)
        }

        console.log("Database seeding from backup completed successfully!")
    } catch (error) {
        console.error("Error during seeding:", error)
    } finally {
        await client.close()
        process.exit(0)
    }
}

seed()
