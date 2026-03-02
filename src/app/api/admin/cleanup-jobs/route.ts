
import { NextResponse } from "next/server"
import { getCollection, COLLECTIONS } from "@/database/connection"

export const dynamic = 'force-dynamic'

export async function GET() {
    try {
        const collection = await getCollection(COLLECTIONS.JOBS)

        // Find all jobs sorted by title
        const jobs = await collection.find({}).sort({ title: 1, postedAt: -1 }).toArray()

        const seen = new Set()
        const duplicates = []

        const debugLog = []
        let deletedCount = 0

        for (const job of jobs) {
            // Aggressive normalization: lowercase and remove ALL non-alphanumeric chars
            const normalize = (str: any) => (str || "").toString().toLowerCase().replace(/[^a-z0-9]/g, "")

            const titleNorm = normalize(job.title)
            const companyNorm = normalize(job.company)
            const typeNorm = normalize(job.type)

            // Identifier based on normalized fields
            const key = `${titleNorm}|${companyNorm}|${typeNorm}`

            // Debug specific job
            if (titleNorm.includes("dataanalystintern")) {
                debugLog.push({
                    title: job.title,
                    key: key,
                    id: job._id.toString(),
                    isSeen: seen.has(key)
                })
            }

            if (key === "||") continue; // Skip empty jobs

            if (seen.has(key)) {
                duplicates.push(job._id)
            } else {
                seen.add(key)
            }
        }

        if (duplicates.length > 0) {
            const result = await collection.deleteMany({
                _id: { $in: duplicates }
            })
            deletedCount = result.deletedCount
        }

        return NextResponse.json({
            success: true,
            message: `Processed ${jobs.length} jobs. Found and deleted ${deletedCount} duplicate jobs.`,
            deletedCount,
            debugLog // Return debug info for inspection
        })

    } catch (error) {
        console.error("Cleanup error:", error)
        return NextResponse.json(
            { success: false, error: "Failed to cleanup jobs" },
            { status: 500 }
        )
    }
}
