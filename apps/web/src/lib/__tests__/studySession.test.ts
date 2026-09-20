import { TabStudySession } from '../studySession';

describe('tab study sessions', () => {
  beforeEach(() => { sessionStorage.clear(); });
  afterEach(() => { vi.restoreAllMocks(); });

  it('reuses an identifier after reload, but separates courses and public routes', () => {
    const first = new TabStudySession('course:1').getId();
    expect(new TabStudySession('course:1').getId()).toBe(first);
    expect(new TabStudySession('course:2').getId()).not.toBe(first);
    expect(new TabStudySession('share:abc').getId()).not.toBe(first);
  });

  it('starts afresh without storage and can inherit a copied tab identifier', () => {
    const first = new TabStudySession('course:1').getId();
    sessionStorage.clear();
    expect(new TabStudySession('course:1').getId()).not.toBe(first);
    // A browser may copy the opener's storage into a new tab.
    sessionStorage.setItem('plog-study-session:course:1', first);
    const copy = new TabStudySession('course:1');
    expect(copy.getId()).toBe(first);
    const original = new TabStudySession('course:1');
    const other = new TabStudySession('course:2').getId();
    expect(original.restart()).not.toBe(first);
    expect(copy.getId()).toBe(first);
    expect(new TabStudySession('course:2').getId()).toBe(other);
  });

  it('keeps a fresh in-memory identifier when even the storage getter throws', () => {
    vi.spyOn(window, 'sessionStorage', 'get').mockImplementation(() => { throw new Error('blocked'); });
    const session = new TabStudySession('course:1');
    const first = session.getId();
    expect(first).toBeTruthy();
    expect(session.persistent).toBe(false);
    expect(session.getId()).toBe(first);
    const fresh = session.restart();
    expect(fresh).not.toBe(first);
    expect(session.getId()).toBe(fresh);
  });

  it('never restores an old identifier after a failed restart write', () => {
    const session = new TabStudySession('course:1');
    const first = session.getId();
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('full'); });
    const fresh = session.restart();
    expect(sessionStorage.getItem('plog-study-session:course:1')).toBe(first);
    expect(session.getId()).toBe(fresh);
    expect(fresh).not.toBe(first);
    expect(session.persistent).toBe(false);
  });
});
