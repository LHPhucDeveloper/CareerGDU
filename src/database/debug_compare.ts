import fs from "fs"
import path from "path"
import { connectToDatabase } from "./connection"

async function debugCompare() {
    const { client, db } = await connectToDatabase()

    try {
        console.log("--- DB DATA (gdu_career.users) ---")
        const dbUsers = await db.collection("users").find().limit(5).toArray()
        dbUsers.forEach(u => console.log(`- ID: ${u._id}, Name: ${u.fullName || u.username}`))

        console.log("\n--- BACKUP FILE DATA (users.json) ---")
        const backupPath = path.join(process.cwd(), "backups/2026-03-02_12-13-43/users.json")
        const backupContent = fs.readFileSync(backupPath, "utf8")
        const backupData = JSON.parse(backupContent)
        backupData.slice(0, 5).forEach((u: any) => console.log(`- ID: ${u._id}, Name: ${u.fullName || u.username}`))

    } catch (error) {
        console.error("Error:", error)
    } finally {
        await client.close()
        process.exit(0)
    }
}

debugCompare()
