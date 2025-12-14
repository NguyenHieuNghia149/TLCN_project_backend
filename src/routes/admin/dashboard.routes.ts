import { Router } from 'express'
import { DashboardController } from '@/controllers/admin/dashboard.controller'

const router = Router()
const controller = new DashboardController()

/**
 * @route GET /api/admin/dashboard/stats
 * @desc Get dashboard statistics and charts data
 * @access Private (Admin only)
 */
router.get('/stats', controller.getStats)

export default router
