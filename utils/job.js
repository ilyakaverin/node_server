/**
 * Оборачивает задачу так, чтобы одновременно выполнялся только один запуск.
 * Запуск, пришедший во время выполнения предыдущего, пропускается: иначе файлы
 * ещё не сохранены в базу и одно и то же обновление уйдёт письмом повторно.
 * @param {() => Promise<void>} task
 */
export function createJob(task) {
  let current = null;

  return {
    /**
     * Запускает задачу, если она ещё не выполняется.
     * @returns {Promise<void>} завершение этого запуска (сразу — если пропущен)
     */
    run() {
      if (current) {
        console.warn("[Пропуск] Предыдущий запуск ещё не завершён");
        return Promise.resolve();
      }
      current = Promise.resolve()
        .then(task)
        .finally(() => {
          current = null;
        });
      return current;
    },

    /**
     * Дожидается завершения текущего запуска (если он есть). Не бросает ошибок.
     * @returns {Promise<void>}
     */
    async idle() {
      await current?.catch(() => {});
    },
  };
}
