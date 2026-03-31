-- AlterTable
ALTER TABLE "Analysis" ADD COLUMN     "competitors" JSONB DEFAULT '[]',
ADD COLUMN     "revenueImpact" JSONB DEFAULT '{}',
ADD COLUMN     "serviceGaps" JSONB DEFAULT '[]',
ADD COLUMN     "socialPresence" JSONB DEFAULT '{}';
