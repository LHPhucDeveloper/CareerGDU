import { NextResponse } from "next/server"
import { getCollection, COLLECTIONS } from "@/database/connection"
import { ObjectId } from "mongodb"

// Admin-only endpoint to sync applicant counts for all jobs
export async function POST(request: Request) {
    try {
        const jobsCollection = await getCollection(COLLECTIONS.JOBS)
        const applicationsCollection = await getCollection(COLLECTIONS.APPLICATIONS)

        // Get all jobs
        const jobs = await jobsCollection.find({}).toArray()

        let updatedCount = 0
        const results: { jobId: string; title: string; oldCount: number; newCount: number }[] = []

        for (const job of jobs) {
            const jobIdStr = job._id.toString()

            // Count applications for this job (try both ObjectId and string match)
            const count = await applicationsCollection.countDocuments({
                $or: [
                    { jobId: jobIdStr },
                    { jobId: job._id }
                ]
            })

            const oldCount = job.applicants || 0

            // Update the job's applicants count
            await jobsCollection.updateOne(
                { _id: job._id },
                { $set: { applicants: count } }
            )

            if (oldCount !== count) {
                updatedCount++
                results.push({
                    jobId: jobIdStr,
                    title: job.title || "Unknown",
                    oldCount,
                    newCount: count
                })
            }
        }

        return NextResponse.json({
            success: true,
            message: `Đã cập nhật ${updatedCount} tin tuyển dụng`,
            totalJobs: jobs.length,
            updatedJobs: updatedCount,
            details: results
        })

    } catch (error) {
        console.error("Error syncing applicant counts:", error)
        return NextResponse.json(
            { success: false, error: "Có lỗi xảy ra khi đồng bộ" },
            { status: 500 }
        )
    }
}
