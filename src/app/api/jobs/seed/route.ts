import { NextResponse } from "next/server"
import { getCollection, COLLECTIONS } from "@/database/connection"
import jobsData from "@/data/jobs.json"

export const dynamic = 'force-dynamic'

export async function POST() {
    try {
        const collection = await getCollection(COLLECTIONS.JOBS)

        // Get existing job count
        const existingCount = await collection.countDocuments()

        // Parse jobs from JSON file
        const rawJobs = Array.isArray(jobsData) ? jobsData : (jobsData as any).jobs || []

        if (rawJobs.length === 0) {
            return NextResponse.json({
                success: false,
                error: "No jobs found in jobs.json"
            }, { status: 400 })
        }

        // Filter jobs with type internship or part-time for seeding
        const internshipJobs = rawJobs.filter((job: any) => {
            const typeLower = (job.type || "").toLowerCase()
            const titleLower = (job.title || "").toLowerCase()
            return (
                typeLower === "internship" ||
                typeLower === "part-time" ||
                titleLower.includes("intern") ||
                titleLower.includes("thực tập")
            )
        })

        // Check if these jobs already exist (by title)
        const existingTitles = await collection.distinct("title")

        // Filter out jobs that already exist
        const newJobs = internshipJobs.filter((job: any) =>
            !existingTitles.includes(job.title)
        )

        if (newJobs.length === 0) {
            return NextResponse.json({
                success: true,
                message: "All internship jobs already exist in database",
                existingCount,
                internshipCount: internshipJobs.length
            })
        }

        // Prepare jobs for insertion (remove _id from JSON to let MongoDB generate new ones)
        const jobsToInsert = newJobs.map((job: any) => {
            const { _id, ...jobWithoutId } = job
            return {
                ...jobWithoutId,
                postedAt: job.postedAt || new Date().toISOString(),
                status: "active",
                applicants: job.applicants || 0,
                views: job.views || 0
            }
        })

        // Insert new jobs
        const result = await collection.insertMany(jobsToInsert)

        return NextResponse.json({
            success: true,
            message: `Successfully seeded ${result.insertedCount} internship jobs`,
            insertedCount: result.insertedCount,
            existingCount,
            newTotal: existingCount + result.insertedCount
        })
    } catch (error) {
        console.error("Error seeding jobs:", error)
        return NextResponse.json(
            { success: false, error: "Failed to seed jobs" },
            { status: 500 }
        )
    }
}

export async function GET() {
    try {
        const collection = await getCollection(COLLECTIONS.JOBS)

        // Get internship jobs count
        const internshipCount = await collection.countDocuments({
            $or: [
                { type: "internship" },
                { type: "part-time" },
                { title: { $regex: "intern", $options: "i" } },
                { title: { $regex: "thực tập", $options: "i" } }
            ]
        })

        const totalCount = await collection.countDocuments()

        return NextResponse.json({
            success: true,
            totalJobs: totalCount,
            internshipJobs: internshipCount
        })
    } catch (error) {
        console.error("Error checking jobs:", error)
        return NextResponse.json(
            { success: false, error: "Failed to check jobs" },
            { status: 500 }
        )
    }
}
