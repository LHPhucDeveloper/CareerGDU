import { NextResponse } from "next/server"
import { getCollection, COLLECTIONS } from "@/database/connection"

// GET - Get saved jobs for a user
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const userId = searchParams.get("userId")

    if (!userId) {
      return NextResponse.json({
        success: false,
        error: "Missing userId",
      }, { status: 400 })
    }

    const collection = await getCollection(COLLECTIONS.SAVED_JOBS)
    const savedJobs = await collection.find({ userId }).sort({ savedAt: -1 }).toArray()

    // Get job details for each saved job
    const jobIds = savedJobs.map((sj) => sj.jobId)

    return NextResponse.json({
      success: true,
      data: savedJobs,
      jobIds: jobIds,
    })
  } catch (error) {
    console.error("[API] Error fetching saved jobs:", error)
    return NextResponse.json({
      success: false,
      error: "Failed to fetch saved jobs",
    }, { status: 500 })
  }
}

// POST - Save a job for a user
export async function POST(request: Request) {
  try {
    const body = await request.json()
    const { userId, jobId, jobData } = body

    if (!userId || !jobId) {
      return NextResponse.json({
        success: false,
        error: "Missing userId or jobId",
      }, { status: 400 })
    }

    const collection = await getCollection(COLLECTIONS.SAVED_JOBS)

    // Check if already saved
    const existing = await collection.findOne({ userId, jobId })

    if (existing) {
      // Remove if already saved (toggle)
      await collection.deleteOne({ userId, jobId })
      return NextResponse.json({
        success: true,
        saved: false,
        message: "Job removed from saved list",
      })
    }

    // Save the job
    await collection.insertOne({
      userId,
      jobId,
      jobData: jobData || {},
      savedAt: new Date(),
    })

    return NextResponse.json({
      success: true,
      saved: true,
      message: "Job saved successfully",
    })
  } catch (error) {
    console.error("[API] Error saving job:", error)
    return NextResponse.json({
      success: false,
      error: "Failed to save job",
    }, { status: 500 })
  }
}

// DELETE - Remove a saved job
export async function DELETE(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const userId = searchParams.get("userId")
    const jobId = searchParams.get("jobId")

    if (!userId || !jobId) {
      return NextResponse.json({
        success: false,
        error: "Missing userId or jobId",
      }, { status: 400 })
    }

    const collection = await getCollection(COLLECTIONS.SAVED_JOBS)
    await collection.deleteOne({ userId, jobId })

    return NextResponse.json({
      success: true,
      message: "Job removed from saved list",
    })
  } catch (error) {
    console.error("[API] Error deleting saved job:", error)
    return NextResponse.json({
      success: false,
      error: "Failed to remove job",
    }, { status: 500 })
  }
}
