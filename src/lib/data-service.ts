import prisma from "@/database/prisma"

export async function getHeroSlides(page: string = "home") {
    try {
        const query: any = { isActive: true }
        if (page !== "all") {
            query.page = page
        }
        const slides = await prisma.heroSlide.findMany({
            where: query,
            orderBy: [
                { order: 'asc' },
                { createdAt: 'desc' }
            ]
        })
        return slides.map(s => ({ ...s, _id: s.id }))
    } catch (error) {
        console.error(`Error fetching hero slides for ${page}:`, error)
        return []
    }
}

export async function getLatestJobs(limit: number = 4) {
    try {
        const jobs = await prisma.job.findMany({
            where: {
                status: "active",
                // Simplified deadline check for Prisma/MySQL
            },
            include: {
                applications: {
                    where: { status: "hired" }
                }
            },
            orderBy: { postedAt: 'desc' },
            take: limit * 2 // Fetch more to filter by quantity/hiredCount in memory if needed
        })

        const filteredJobs = jobs.filter(job => {
            const hiredCount = job.applications.length
            const isAvailable = job.quantity === -1 || hiredCount < (job.quantity || 1)
            
            // Basic deadline check (string-based)
            const isDeadlineValid = !job.deadline || 
                                   job.deadline === "Vô thời hạn" || 
                                   job.deadline === "" ||
                                   new Date() <= new Date(job.deadline) // Basic check

            return isAvailable && isDeadlineValid
        }).slice(0, limit)

        return filteredJobs.map(j => ({ ...j, _id: j.id }))
    } catch (error) {
        console.error("Error fetching latest jobs:", error)
        return []
    }
}

export async function getSiteConfig(key: string) {
    try {
        const config = await prisma.siteConfig.findUnique({
            where: { key }
        })
        return config ? { ...config, _id: config.id } : null
    } catch (error) {
        console.error(`Error fetching site config for ${key}:`, error)
        return null
    }
}

