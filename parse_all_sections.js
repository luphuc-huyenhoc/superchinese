const { DatabaseSync } = require('node:sqlite');
const fs = require('node:fs');
const path = require('node:path');

const dbPath = path.join(__dirname, 'data', 'sc_backup', 'DB_SuperChinese');
const db = new DatabaseSync(dbPath, { open: true, readOnly: true });

function resolveUrl(url) {
  if (!url || typeof url !== 'string') return '';
  if (url.startsWith('http://') || url.startsWith('https://')) return url;
  if (url.startsWith('@oss/tts/') || url.startsWith('@audio/')) {
    return 'https://akm.hskcdn.com/sc/audio/' + url.replace(/^@(oss\/tts|audio)\//, '');
  }
  if (url.startsWith('@video/')) {
    return 'https://akm.hskcdn.com/sc/video/' + url.replace(/^@video\//, '');
  }
  if (url.startsWith('@oss/upload/')) {
    return 'https://akm.hskcdn.com/sc/upload/' + url.replace(/^@oss\/upload\//, '');
  }
  if (url.startsWith('@oss/')) {
    return 'https://akm.hskcdn.com/sc/' + url.replace(/^@oss\//, '');
  }
  if (url.startsWith('@cdn/')) {
    return 'https://akm.hskcdn.com/' + url.replace(/^@cdn\//, '');
  }
  return url;
}

function parseExercise(e) {
  if (!e.exercise_entity || !e.exercise_entity.data) return null;
  const ex = e.exercise_entity;
  try {
    const data = JSON.parse(ex.data);
    const title = ex.type ? ex.type.title.trim() : 'Chọn đáp án đúng';
    let prompt = data.subject || data.audioText || data.question || '';
    let py = data.subjectPinyin || data.audioPinyin || '';
    let audio = resolveUrl(data.audio || data.answerAudio || data.questionAudio || '');
    let image = resolveUrl(data.image || '');
    let translation = '';
    if (data.translation) {
      translation = typeof data.translation === 'string' ? data.translation : (data.translation.subject || data.translation.audioText || '');
    }

    // 1. TRUE / FALSE
    const isTrueFalseType = title.includes('khớp') || title.includes('đúng sai') || title.includes('chính xác hay không') || title.includes('tương tự');
    if (isTrueFalseType || (data.items === undefined && data.answer !== undefined && (typeof data.answer === 'number' || typeof data.answer === 'boolean'))) {
      const isCorrect = (data.answer === 1 || data.answer === true);
      return {
        quizType: 'choice',
        title: title,
        prompt: prompt || 'Nội dung của hình ảnh/âm thanh có khớp nhau?',
        py: py,
        audio: audio,
        image: image,
        meaning: translation,
        options: ['✓ Đúng (Chính xác)', '✕ Sai (Không khớp)'],
        answer: isCorrect ? 0 : 1
      };
    }

    // 2. MULTIPLE CHOICE / FILL-IN-THE-BLANK / UNSCRAMBLE
    if (data.items && data.items.length > 1) {
      let ansIdx = -1;
      if (typeof data.answer === 'number') {
        ansIdx = data.answer;
      } else if (data.answers && data.answers[0] && Array.isArray(data.answers[0].answer) && data.answers[0].answer.length === 1) {
        ansIdx = data.answers[0].answer[0];
      }

      // Sentence unscrambling
      if (title.includes('Sắp xếp') || (data.answers && data.answers[0] && Array.isArray(data.answers[0].answer) && data.answers[0].answer.length > 1)) {
        const words = data.items.map(it => ({
          text: it.text || '',
          pinyin: it.pinyin || '',
          audio: resolveUrl(it.audio || '')
        }));
        const correctOrder = (data.answers && data.answers[0] && data.answers[0].answer) ? data.answers[0].answer : data.items.map((_, i) => i);
        return {
          quizType: 'unscramble',
          title: title,
          prompt: prompt || translation || 'Sắp xếp các từ thành câu hoàn chỉnh:',
          py: py,
          audio: audio,
          image: image,
          meaning: translation,
          words: words,
          correctOrder: correctOrder
        };
      }

      if (ansIdx >= 0 && ansIdx < data.items.length) {
        const options = data.items.map(it => resolveUrl(it.text || it.image || it.pinyin || ''));
        if (options.every(o => o && o.length > 0)) {
          return {
            quizType: 'choice',
            title: title,
            prompt: prompt || 'Chọn đáp án chính xác:',
            py: py,
            audio: audio,
            image: image,
            meaning: translation,
            options: options,
            answer: ansIdx
          };
        }
      }
    }

    // 3. INSERT WORD AT POSITION
    if (title.includes('vị trí') && data.items && data.items.length === 1) {
      const word = data.items[0].text;
      let posIdx = 0;
      if (Array.isArray(data.answer)) {
        posIdx = data.answer.indexOf(0);
        if (posIdx < 0) posIdx = 0;
      } else if (typeof data.answer === 'number') {
        posIdx = data.answer;
      }
      return {
        quizType: 'choice',
        title: title,
        prompt: `Đặt từ "${word}" vào vị trí phù hợp: ` + prompt,
        py: py,
        audio: audio,
        image: image,
        meaning: translation,
        options: ['Vị trí (A)', 'Vị trí (B)', 'Vị trí (C)'].slice(0, 2),
        answer: posIdx < 2 ? posIdx : 0
      };
    }

    // 4. SPEAK / REPEAT
    if (title.includes('Đọc to') || title.includes('Nhắc lại') || title.includes('Đọc câu')) {
      return {
        quizType: 'speak',
        title: title,
        prompt: prompt,
        py: py,
        audio: audio,
        image: image,
        meaning: translation,
        options: ['Đã luyện phát âm 👍'],
        answer: 0
      };
    }

  } catch (err) {}
  return null;
}

const rows = db.prepare('SELECT LID, TYPE, DATA FROM LESSON_BEAN ORDER BY _id ASC').all();

const fullCurriculum = {};

for (const r of rows) {
  try {
    const d = JSON.parse(r.DATA);
    let level = 'L1';
    let unitNum = 1;

    if (d.location && d.location.startsWith('L')) {
      const parts = d.location.split('-');
      level = parts[0];
      unitNum = parseInt(parts[1]) || 1;
    } else {
      for (const c of d.collections || []) {
        for (const e of c.entities || []) {
          if (e.word_entity && e.word_entity.level) {
            level = 'L' + e.word_entity.level;
            break;
          }
        }
      }
    }

    if (!fullCurriculum[level]) fullCurriculum[level] = {};
    if (!fullCurriculum[level][unitNum]) {
      fullCurriculum[level][unitNum] = {
        unit: unitNum,
        title: `Bài ${unitNum}`,
        words: { title: 'Từ vựng', list: [], quizzes: [] },
        grammar: { title: 'Ngữ pháp', rules: [], quizzes: [] },
        text: { title: 'Bài khóa', topic: '', video: '', sentences: [], quizzes: [] },
        test: { title: 'Bài kiểm tra', quizzes: [] }
      };
    }

    const unit = fullCurriculum[level][unitNum];
    const sectionType = r.TYPE;

    for (const c of d.collections || []) {
      for (const e of c.entities || []) {
        // WORDS
        if (sectionType === 'words' && e.word_entity) {
          const w = e.word_entity;
          const viTrans = w.translation ? w.translation.text : (w.hints || '');
          if (!unit.words.list.find(x => x.hz === w.text)) {
            let ex = null;
            if (w.sentences && w.sentences.length > 0) {
              const s = w.sentences[0];
              ex = {
                hz: s.text,
                py: s.pinyin,
                vi: s.translation ? s.translation.text : '',
                audio: resolveUrl(s.audio)
              };
            }
            unit.words.list.push({
              hz: w.text,
              py: w.pinyin,
              vi: viTrans,
              type: w.classifyLabel || '',
              audio: resolveUrl(w.audio),
              image: resolveUrl(w.image),
              example: ex
            });
          }
        }

        // GRAMMAR
        if (sectionType === 'grammar') {
          if (e.entity_type === 'graphic' && e.graphic_entity && e.graphic_entity.data) {
            try {
              const gData = JSON.parse(e.graphic_entity.data);
              for (const page of gData) {
                let ruleText = '';
                let explainVi = '';
                for (const det of page.details || []) {
                  if (det.type === 'Frame' && det.data && det.data.frame) {
                    for (const elem of det.data.frame.elements || []) {
                      if (elem.data && elem.data.grammar) {
                        ruleText = elem.data.grammar.text || '';
                      }
                    }
                  }
                  if (det.type === 'Translation' && det.data && det.data.translation) {
                    const transList = det.data.translation.translations || [];
                    const viItem = transList.find(t => t.lang === 'vi');
                    if (viItem) {
                      explainVi += (explainVi ? ' - ' : '') + viItem.text;
                    }
                  }
                }
                if (ruleText && !unit.grammar.rules.find(x => x.rule === ruleText)) {
                  unit.grammar.rules.push({
                    rule: ruleText,
                    explain: explainVi
                  });
                }
              }
            } catch (err) {}
          }
          if (e.entity_type === 'grammar' && e.grammar_entity) {
            const ge = e.grammar_entity;
            if (ge.text) {
              const existing = unit.grammar.rules.find(x => x.rule === ge.text);
              if (existing) {
                existing.example = {
                  hz: ge.text,
                  py: ge.pinyin || '',
                  audio: resolveUrl(ge.audio),
                  image: resolveUrl(ge.image)
                };
              }
            }
          }
        }

        // TEXT / DIALOGUE
        if (sectionType === 'text') {
          if (e.entity_type === 'kewen' || e.entity_type === 'kwparg') {
            const kw = e.kewen_entity || e.kwparg_entity;
            if (kw) {
              if (kw.kewen) {
                if (kw.kewen.title && !unit.text.topic) unit.text.topic = kw.kewen.title;
                if (kw.kewen.video && !unit.text.video) unit.text.video = resolveUrl(kw.kewen.video);
              }
              if (kw.video && !unit.text.video) unit.text.video = resolveUrl(kw.video);

              if (kw.sentences) {
                for (const s of kw.sentences) {
                  if (!unit.text.sentences.find(x => x.hz === s.text)) {
                    unit.text.sentences.push({
                      role: s.role || 'Nhân vật',
                      hz: s.text,
                      py: s.pinyin,
                      vi: s.translation ? s.translation.text : '',
                      audio: resolveUrl(s.audio)
                    });
                  }
                }
              }
            }
          }
        }

        // EXERCISES / QUIZZES
        if (e.exercise_entity && e.exercise_entity.data) {
          const quizObj = parseExercise(e);
          if (quizObj) {
            if (sectionType === 'words') unit.words.quizzes.push(quizObj);
            else if (sectionType === 'grammar') unit.grammar.quizzes.push(quizObj);
            else if (sectionType === 'text') unit.text.quizzes.push(quizObj);
            else if (sectionType === 'test') unit.test.quizzes.push(quizObj);
          }
        }
      }
    }
  } catch (err) {}
}

const outputPath = path.join(__dirname, 'curriculum_complete.json');
fs.writeFileSync(outputPath, JSON.stringify(fullCurriculum, null, 2), 'utf-8');

const jsPath = path.join(__dirname, 'lessons_data.js');
fs.writeFileSync(jsPath, 'window.LESSONS_DATA = ' + JSON.stringify(fullCurriculum) + ';', 'utf-8');

console.log('Successfully re-compiled curriculum with full exercises, videos & audio!');
