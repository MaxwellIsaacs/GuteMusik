# Temporal Scroll Implementation

## Completed
- [x] Create `utils/albumYear.ts` - iTunes API year fetching utility
- [x] Create `hooks/useAlbumYears.ts` - hook to enrich albums with years
- [x] Update LibraryView.tsx - add state, refs, and computed values
- [x] Update LibraryView.tsx - add IntersectionObserver and click handlers
- [x] Update LibraryView.tsx - add filter state in header
- [x] Update LibraryView.tsx - add temporal sidebar and grouped grid
- [x] Build verification passed

## Summary
Added a temporal scroll sidebar to the Collection view that displays years along the right side. Albums are now grouped by release year (newest first).

### Behavior
- **Single click** on year: Scrolls to albums from that year
- **Double click** on year: Filters to only show albums from that year
- **Double click** again: Clears filter
- Active year highlights while scrolling (IntersectionObserver)
- Missing years fetched from iTunes API (cached)

### Files Created
- `utils/albumYear.ts` - Fetches release years from iTunes Search API
- `hooks/useAlbumYears.ts` - Hook to enrich albums with missing years

### Files Modified
- `views/LibraryView.tsx` - Added temporal scroll UI and year grouping
