import {
  createVideoIdSet,
  filterItems,
  mapItems,
  groupBy,
  sortItems,
  removeDuplicates,
} from '../dataUtils'

describe('dataUtils', () => {
  describe('createVideoIdSet', () => {
    it('should create Set from array', () => {
      const set = createVideoIdSet([1, 2, 3])
      expect(set).toBeInstanceOf(Set)
      expect(set.has(1)).toBe(true)
      expect(set.has(2)).toBe(true)
      expect(set.has(3)).toBe(true)
    })
  })

  describe('filterItems', () => {
    it('should filter items', () => {
      const items = [1, 2, 3, 4, 5]
      const result = filterItems(items, (item) => item > 3)
      expect(result).toEqual([4, 5])
    })

    it('should not mutate original array', () => {
      const items = [1, 2, 3]
      filterItems(items, (item) => item > 1)
      expect(items).toEqual([1, 2, 3])
    })
  })

  describe('mapItems', () => {
    it('should map items', () => {
      const items = [1, 2, 3]
      const result = mapItems(items, (item) => item * 2)
      expect(result).toEqual([2, 4, 6])
    })
  })

  describe('groupBy', () => {
    it('should group items by key', () => {
      const items = [
        { id: 1, category: 'A' },
        { id: 2, category: 'B' },
        { id: 3, category: 'A' },
      ]
      const result = groupBy(items, (item) => item.category)
      expect(result).toEqual({
        A: [{ id: 1, category: 'A' }, { id: 3, category: 'A' }],
        B: [{ id: 2, category: 'B' }],
      })
    })

    it('should handle numeric keys', () => {
      const items = [
        { id: 1, value: 10 },
        { id: 2, value: 20 },
        { id: 3, value: 10 },
      ]
      const result = groupBy(items, (item) => item.value)
      expect(result[10]).toHaveLength(2)
      expect(result[20]).toHaveLength(1)
    })
  })

  describe('sortItems', () => {
    it('should sort items ascending', () => {
      const items = [3, 1, 2]
      const result = sortItems(items, (item) => item, true)
      expect(result).toEqual([1, 2, 3])
    })

    it('should sort items descending', () => {
      const items = [3, 1, 2]
      const result = sortItems(items, (item) => item, false)
      expect(result).toEqual([3, 2, 1])
    })

    it('should sort by object property', () => {
      const items = [
        { id: 3, name: 'C' },
        { id: 1, name: 'A' },
        { id: 2, name: 'B' },
      ]
      const result = sortItems(items, (item) => item.id, true)
      expect(result[0].id).toBe(1)
      expect(result[1].id).toBe(2)
      expect(result[2].id).toBe(3)
    })

    it('should not mutate original array', () => {
      const items = [3, 1, 2]
      sortItems(items, (item) => item)
      expect(items).toEqual([3, 1, 2])
    })
  })

  describe('removeDuplicates', () => {
    it('should remove duplicates', () => {
      const items = [
        { id: 1, name: 'A' },
        { id: 2, name: 'B' },
        { id: 1, name: 'A' },
      ]
      const result = removeDuplicates(items, (item) => item.id)
      expect(result).toHaveLength(2)
      expect(result[0].id).toBe(1)
      expect(result[1].id).toBe(2)
    })

    it('should keep first occurrence', () => {
      const items = [
        { id: 1, name: 'First' },
        { id: 2, name: 'Second' },
        { id: 1, name: 'Third' },
      ]
      const result = removeDuplicates(items, (item) => item.id)
      expect(result[0].name).toBe('First')
    })
  })
})

