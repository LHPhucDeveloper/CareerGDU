import { NextResponse } from "next/server"
import { getCollection, COLLECTIONS } from "@/database/connection"

export const dynamic = 'force-dynamic'

// Helper to get start of month
function getStartOfMonth(date: Date): Date {
    return new Date(date.getFullYear(), date.getMonth(), 1)
}

// Helper to get month name in Vietnamese
function getMonthName(monthIndex: number): string {
    return `T${monthIndex + 1}`
}

export async function GET() {
    try {
        const now = new Date()
        const thisMonthStart = getStartOfMonth(now)
        const lastMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1)
        const lastMonthEnd = new Date(thisMonthStart.getTime() - 1)

        // Get all collections
        const visitorsCollection = await getCollection(COLLECTIONS.VISITORS)
        const usersCollection = await getCollection(COLLECTIONS.USERS)
        const jobsCollection = await getCollection(COLLECTIONS.JOBS)
        const applicationsCollection = await getCollection(COLLECTIONS.APPLICATIONS)

        // ============== SUMMARY STATS ==============

        // Visitors
        const totalVisitors = await visitorsCollection.countDocuments()
        const visitorsThisMonth = await visitorsCollection.countDocuments({
            visitedAt: { $gte: thisMonthStart }
        })
        const visitorsLastMonth = await visitorsCollection.countDocuments({
            visitedAt: { $gte: lastMonthStart, $lt: thisMonthStart }
        })
        const visitorsChange = visitorsLastMonth > 0
            ? Math.round(((visitorsThisMonth - visitorsLastMonth) / visitorsLastMonth) * 100)
            : 100

        // New students this month
        const newStudentsThisMonth = await usersCollection.countDocuments({
            role: "student",
            createdAt: { $gte: thisMonthStart }
        })
        const newStudentsLastMonth = await usersCollection.countDocuments({
            role: "student",
            createdAt: { $gte: lastMonthStart, $lt: thisMonthStart }
        })
        const studentsChange = newStudentsLastMonth > 0
            ? Math.round(((newStudentsThisMonth - newStudentsLastMonth) / newStudentsLastMonth) * 100)
            : 100

        // New jobs this month
        const newJobsThisMonth = await jobsCollection.countDocuments({
            postedAt: { $gte: thisMonthStart.toISOString() }
        })
        const newJobsLastMonth = await jobsCollection.countDocuments({
            postedAt: { $gte: lastMonthStart.toISOString(), $lt: thisMonthStart.toISOString() }
        })
        const jobsChange = newJobsLastMonth > 0
            ? Math.round(((newJobsThisMonth - newJobsLastMonth) / newJobsLastMonth) * 100)
            : 100

        // Application rate (applications / total job views)
        const totalApplications = await applicationsCollection.countDocuments()
        const totalJobViews = await jobsCollection.aggregate([
            { $group: { _id: null, totalViews: { $sum: "$views" } } }
        ]).toArray()
        const views = totalJobViews[0]?.totalViews || 1
        const applicationRate = Math.round((totalApplications / views) * 100)

        // Last month application rate for comparison
        const applicationsThisMonth = await applicationsCollection.countDocuments({
            appliedAt: { $gte: thisMonthStart }
        })
        const applicationsLastMonth = await applicationsCollection.countDocuments({
            appliedAt: { $gte: lastMonthStart, $lt: thisMonthStart }
        })
        const rateChange = applicationsLastMonth > 0
            ? Math.round(((applicationsThisMonth - applicationsLastMonth) / applicationsLastMonth) * 100)
            : 0

        // ============== TRAFFIC DATA (Last 12 months) ==============
        const trafficData = []
        for (let i = 11; i >= 0; i--) {
            const monthStart = new Date(now.getFullYear(), now.getMonth() - i, 1)
            const monthEnd = new Date(now.getFullYear(), now.getMonth() - i + 1, 0, 23, 59, 59)

            const visitors = await visitorsCollection.countDocuments({
                visitedAt: { $gte: monthStart, $lte: monthEnd }
            })

            // Estimate page views as ~3x visitors (average pages per session)
            const pageViews = visitors * 3

            trafficData.push({
                name: getMonthName(monthStart.getMonth()),
                visitors,
                pageViews
            })
        }

        // ============== USER GROWTH DATA (Last 6 months) ==============
        const userGrowthData = []
        for (let i = 5; i >= 0; i--) {
            const monthStart = new Date(now.getFullYear(), now.getMonth() - i, 1)
            const monthEnd = new Date(now.getFullYear(), now.getMonth() - i + 1, 0, 23, 59, 59)

            // Cumulative count up to end of month
            const students = await usersCollection.countDocuments({
                role: "student",
                createdAt: { $lte: monthEnd }
            })
            const employers = await usersCollection.countDocuments({
                role: "employer",
                createdAt: { $lte: monthEnd }
            })

            userGrowthData.push({
                name: getMonthName(monthStart.getMonth()),
                students,
                employers
            })
        }

        // ============== JOB CATEGORY DATA ==============
        const jobCategories = await jobsCollection.aggregate([
            { $match: { status: "active" } },
            { $group: { _id: "$field", jobs: { $sum: 1 } } },
            { $sort: { jobs: -1 } },
            { $limit: 6 }
        ]).toArray()

        // Get application counts per field
        const jobCategoryData = await Promise.all(
            jobCategories.map(async (cat) => {
                // Count applications for jobs in this field
                const jobsInField = await jobsCollection.find({ field: cat._id }).toArray()
                const jobIds = jobsInField.map(j => j._id.toString())

                const applications = await applicationsCollection.countDocuments({
                    jobId: { $in: jobIds }
                })

                return {
                    name: cat._id || "Khác",
                    jobs: cat.jobs,
                    applications
                }
            })
        )

        return NextResponse.json({
            success: true,
            data: {
                summary: {
                    totalVisitors,
                    visitorsThisMonth,
                    visitorsChange,
                    newStudents: newStudentsThisMonth,
                    studentsChange,
                    newJobs: newJobsThisMonth,
                    jobsChange,
                    applicationRate,
                    rateChange,
                    totalApplications
                },
                trafficData,
                userGrowthData,
                jobCategoryData
            }
        })
    } catch (error) {
        console.error("Analytics API error:", error)
        return NextResponse.json(
            { success: false, error: "Failed to fetch analytics" },
            { status: 500 }
        )
    }
}
