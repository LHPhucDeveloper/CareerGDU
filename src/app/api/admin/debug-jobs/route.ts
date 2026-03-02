
import { NextResponse } from "next/server"
import { getCollection, COLLECTIONS } from "@/database/connection"

export const dynamic = 'force-dynamic'

export async function GET() {
    try {
        const collection = await getCollection(COLLECTIONS.JOBS)
        const jobs = await collection.find({}).sort({ postedAt: -1 }).toArray()

        const simplifiedJobs = jobs.map(job => ({
            _id: job._id.toString(),
            title: job.title,
            company: job.company,
            type: job.type,
            status: job.status,
            createdAt: job.createdAt,
            postedAt: job.postedAt
        }))

        return NextResponse.json({
            count: jobs.length,
            jobs: simplifiedJobs
        })
    } catch (error) {
        return NextResponse.json({ error: "Failed to specific jobs" }, { status: 500 })
    }
}
