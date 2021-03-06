import { Handler } from 'express';
import Joi from 'joi';
import Container from '../../Container';
import Game from '../../database/Game';
import ClientError from '../error/ClientError';
import socketRequest from './socketRequest';

const message = (container: Container): Handler => async (req, res, next) => {
  try {
    const user = req.user;

    if (!user) {
      return next(new ClientError('You must be logged in', 401));
    }

    const gameId = req.params.gameId;

    const { value, error } = Joi.string().validate(gameId);
    if (error) {
      const errors = error.details.map(d => d.message).join(', ');
      return next(new ClientError(`Invalid param: ${errors}`));
    }

    const game = await container.connection.getRepository(Game).findOne({
      where: { gameId: value },
      relations: ['engine', 'settings', 'activePlayer', 'players'],
    });

    if (!game) {
      return next(new ClientError('Invalid game ID'));
    }

    if (!game.players.find(p => p.id === user.id)) {
      return next(new ClientError('Invalid game ID'));
    }

    const engine = container.engineRegistry.getEngine(game.engine.engineId);

    if (!engine) {
      return next(new ClientError('Engine is offline'));
    }

    const { socket } = engine;

    const result = await socketRequest(socket, {
      type: 'clientMessage',
      data: {
        gameId: game.gameId,
        playerId: user.name,
        content: req.body,
      },
    });

    const schema = Joi.object().keys({
      type: Joi.allow('clientResponse').required(),
      data: Joi.any().required(),
    });

    const { value: responseValue, error: responseError } = schema.validate(
      result,
    );

    if (responseError) {
      return next(new ClientError('Engine failed to respond'));
    }

    res.send(responseValue.data);
  } catch (error) {
    console.error(error);
    next(error);
  }
};

export default message;
