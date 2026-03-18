import { NextResponse } from "next/server"
import prisma from "@/database/prisma"

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

        // ============== SUMMARY STATS ==============

        // Visitors
        const totalVisitors = await prisma.visitor.count()
        const visitorsThisMonth = await prisma.visitor.count({
            where: { visitedAt: { gte: thisMonthStart } }
        })
        const visitorsLastMonth = await prisma.visitor.count({
            where: { visitedAt: { gte: lastMonthStart, lt: thisMonthStart } }
        })
        const visitorsChange = visitorsLastMonth > 0
            ? Math.round(((visitorsThisMonth - visitorsLastMonth) / visitorsLastMonth) * 100)
            : 100

        // New students
        const newStudentsThisMonth = await prisma.user.count({
            where: { role: "student", createdAt: { gte: thisMonthStart } }
        })
        const newStudentsLastMonth = await prisma.user.count({
            where: { role: "student", createdAt: { gte: lastMonthStart, lt: thisMonthStart } }
        })
        const studentsChange = newStudentsLastMonth > 0
            ? Math.round(((newStudentsThisMonth - newStudentsLastMonth) / newStudentsLastMonth) * 100)
            : 100

        // New jobs
        const newJobsThisMonth = await prisma.job.count({
            where: { createdAt: { gte: thisMonthStart } }
        })
        const newJobsLastMonth = await prisma.job.count({
            where: { createdAt: { gte: lastMonthStart, lt: thisMonthStart } }
        })
        const jobsChange = newJobsLastMonth > 0
            ? Math.round(((newJobsThisMonth - newJobsLastMonth) / newJobsLastMonth) * 100)
            : 100

        // Application rate
        const totalApplications = await prisma.application.count()
        const jobViewsAgg = await prisma.job.aggregate({
            _sum: { views: true }
        })
        const views = jobViewsAgg._sum.views || 1
        const applicationRate = Math.round((totalApplications / views) * 100)

        // Comparison rate
        const applicationsThisMonth = await prisma.application.count({
            where: { appliedAt: { gte: thisMonthStart } }
        })
        const applicationsLastMonth = await prisma.application.count({
            where: { appliedAt: { gte: lastMonthStart, lt: thisMonthStart } }
        })
        const rateChange = applicationsLastMonth > 0
            ? Math.round(((applicationsThisMonth - applicationsLastMonth) / applicationsLastMonth) * 100)
            : 0

        // ============== TRAFFIC DATA (Last 12 months) ==============
        const trafficData = []
        for (let i = 11; i >= 0; i--) {
            const mStart = new Date(now.getFullYear(), now.getMonth() - i, 1)
            const mEnd = new Date(now.getFullYear(), now.getMonth() - i + 1, 0, 23, 59, 59)

            const visitorsCount = await prisma.visitor.count({
                where: { visitedAt: { gte: mStart, lte: mEnd } }
            })

            trafficData.push({
                name: getMonthName(mStart.getMonth()),
                visitors: visitorsCount,
                pageViews: visitorsCount * 3
            })
        }

        // ============== USER GROWTH DATA (Last 6 months) ==============
        const userGrowthData = []
        for (let i = 5; i >= 0; i--) {
            const mStart = new Date(now.getFullYear(), now.getMonth() - i, 1)
            const mEnd = new Date(now.getFullYear(), now.getMonth() - i + 1, 0, 23, 59, 59)

            const studentsCount = await prisma.user.count({
                where: { role: "student", createdAt: { lte: mEnd } }
            })
            const employersCount = await prisma.user.count({
                where: { role: "employer", createdAt: { lte: mEnd } }
            })

            userGrowthData.push({
                name: getMonthName(mStart.getMonth()),
                students: studentsCount,
                employers: employersCount
            })
        }

        // ============== JOB CATEGORY DATA ==============
        const jobEntriesByField = await prisma.job.groupBy({
            by: ['field'],
            where: { status: "active" },
            _count: { id: true },
            orderBy: { _count: { id: 'desc' } },
            take: 6
        })

        const jobCategoryData = await Promise.all(
            jobEntriesByField.map(async (entry) => {
                const field = entry.field
                const applicationsCount = await prisma.application.count({
                    where: { job: { field: field } }
                })

                return {
                    name: field || "Khác",
                    jobs: entry._count.id,
                    applications: applicationsCount
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
        return NextResponse.json({ success: false, error: "Failed to fetch analytics" }, { status: 500 })
    }
}

